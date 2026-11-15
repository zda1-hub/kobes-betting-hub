'use strict';

// One budgeted NBA points market per Pacific day. No exact quote, completed
// history, active team roster, or clean injury check means no member-facing send.
const fs = require('node:fs/promises');
const path = require('node:path');
const { events, eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const bdl = require('./bdl-nba');
const { publishVerifiedCandidate } = require('./verified-publisher');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');
const { playerNameKey } = require('./player-name');

const MARKET = 'player_points_alternate';
const MIN_BEFORE_MS = 30 * 60_000;
const MAX_BEFORE_MS = 90 * 60_000;

function featuredEvent(rows, now, skipped = new Set()) {
  const date = localParts(now, TIME_ZONE).date;
  return (rows || []).filter(row => /^[a-zA-Z0-9_-]{8,80}$/.test(row?.id || '') &&
    !skipped.has(row.id) && Number.isFinite(Date.parse(row.commence_time)) &&
    belongsToServiceDate(row.commence_time, date) &&
    Date.parse(row.commence_time) - now.valueOf() >= MIN_BEFORE_MS &&
    Date.parse(row.commence_time) - now.valueOf() <= MAX_BEFORE_MS)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))[0] || null;
}

function candidateOffers(rows, now) {
  const best = new Map();
  for (const row of rows || []) {
    if (row.market !== MARKET || row.side !== 'over' || !row.player ||
        !Number.isFinite(row.line) || !Number.isInteger(row.odds) || row.odds < -400 ||
        !row.sportsbook || !row.sportsbookKey || !Number.isFinite(Date.parse(row.updatedAt)) ||
        Date.parse(row.updatedAt) > now.valueOf() || now.valueOf() - Date.parse(row.updatedAt) > 5 * 60_000) continue;
    const key = `${playerNameKey(row.player)}:${row.line}`;
    if (!best.has(key) || best.get(key).odds < row.odds) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => b.odds - a.odds).slice(0, 6);
}

async function scanNbaAuto({ root, apiKey, bdlKey, channelId, channelFor, now = new Date(),
  fetchImpl = fetch, readEvents = events, readOdds = eventAlternateOdds,
  readBdlEvent = bdl.exactEvent, readPlayer = bdl.exactActivePlayer,
  readHistory = bdl.history, readAvailability = bdl.availability,
  publish = publishVerifiedCandidate,
  reserveOdds = withOddsBudget } = {}) {
  if (!root || !apiKey || !bdlKey || !channelId || typeof channelFor !== 'function')
    throw new Error('NBA trend automation requires storage, Odds API, NBA data key and private channel');
  const date = localParts(now, TIME_ZONE).date;
  const directory = path.join(root, 'trends-auto');
  let files = [];
  try { files = (await fs.readdir(directory)).filter(name => name.startsWith(`nba-${date}-`) && name.endsWith('.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const attempts = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))));
  const terminal = attempts.find(row => ['published', 'reserved', 'needs_reconciliation'].includes(row.status));
  if (terminal) return { ...terminal, existing: true };
  if (attempts.length >= 3) return { status: 'held', date, reason: 'Three-event daily market cap reached', existing: true };
  const schedule = await readEvents('NBA', { apiKey, fetchImpl });
  const event = featuredEvent(schedule.data, now, new Set(attempts.map(row => row.eventId)));
  if (!event) return { status: 'waiting', date, reason: 'No provider-listed NBA game is 30–90 minutes from tipoff' };
  const file = path.join(directory, `nba-${date}-${event.id}.json`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const reserved = { status: 'reserved', date, eventId: event.id, market: MARKET,
    at: now.toISOString() };
  try { await fs.writeFile(file, JSON.stringify(reserved), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', date }; throw error; }
  let outcome = reserved;
  try {
    const odds = await reserveOdds({ root, apiKey, fetchImpl, now, operation: () =>
      readOdds('NBA', event.id, { apiKey, fetchImpl, market: MARKET }) });
    const offers = candidateOffers(odds.selections, now);
    const bdlEvent = await readBdlEvent({ event, now, apiKey: bdlKey, fetchImpl });
    const holds = [];
    let sendAttempted = false;
    for (const offer of offers) {
      try {
        const player = await readPlayer({ name: offer.player, game: bdlEvent,
          apiKey: bdlKey, fetchImpl });
        const history = await readHistory({ playerId: player.id, stat: 'points',
          line: offer.line, now, apiKey: bdlKey, fetchImpl });
        if (history.rightsUrl !== bdl.TERMS_URL) {
          holds.push('NBA history source rights unverified'); continue;
        }
        if (history.analysis.season.sample < 10 || history.analysis.l20.sample < 20 ||
            history.analysis.season.hitRate < 0.8) {
          holds.push('insufficient or below-threshold history'); continue;
        }
        const availability = await readAvailability({ playerId: player.id,
          now, apiKey: bdlKey, fetchImpl });
        if (availability.status !== 'active-roster-no-listed-injury' ||
            availability.rightsUrl !== bdl.TERMS_URL) {
          holds.push('NBA injury status is uncertain'); continue;
        }
        const teamName = player.team.full_name;
        const opponent = player.team.id === bdlEvent.home_team.id ?
          bdlEvent.visitor_team.full_name : bdlEvent.home_team.full_name;
        const candidate = { player: offer.player, analysis: history.analysis,
          analysisSource: history.sourceUrl, analysisCheckedAt: history.checkedAt, availability,
          rights: { history: 'commercial-use-confirmed', availability: 'commercial-use-confirmed',
            termsUrl: bdl.TERMS_URL },
          prop: { ...offer, sport: 'NBA', stat: 'points', side: 'over',
            startsAt: event.commence_time, eventId: event.id,
            teamId: teamName, opponentId: opponent, available: true, source: 'The Odds API',
            rosterVerified: true, rosterVerifiedAt: now.toISOString(),
            participationVerified: false, preGameAvailabilityChecked: true } };
        sendAttempted = true;
        const receipt = await publish({ root, candidate, channelId, channelFor, now });
        outcome = { status: 'published', date, eventId: event.id,
          messageId: receipt.messageId, candidateId: receipt.id, checkedOffers: offers.length };
        break;
      } catch (error) {
        holds.push(error.message);
        if (sendAttempted) {
          outcome = { status: 'needs_reconciliation', date, eventId: event.id,
            error: error.message };
          break;
        }
      }
    }
    if (outcome.status === 'reserved') outcome = { status: 'held', date, eventId: event.id,
      checkedOffers: offers.length, reasons: [...new Set(holds)].slice(0, 8) };
  } catch (error) {
    outcome = { status: 'held', date, eventId: event.id, error: error.message };
  }
  // A reserved send with an uncertain Discord response must not become a
  // silent "held" scan that can be retried as another daily candidate.
  await fs.writeFile(file, JSON.stringify(outcome, null, 2), { mode: 0o600 });
  return outcome;
}

module.exports = { MARKET, featuredEvent, candidateOffers, scanNbaAuto };
