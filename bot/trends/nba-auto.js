'use strict';

// Two budgeted NBA event scans per Pacific day. No exact quote, completed
// history, active team roster, or clean injury check means no member-facing send.
const fs = require('node:fs/promises');
const path = require('node:path');
const { events, eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const bdl = require('./bdl-nba');
const { publishVerifiedCandidate } = require('./verified-publisher');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');
const { playerNameKey } = require('./player-name');

const MARKET_STATS = Object.freeze({
  player_points_alternate: 'points',
  player_rebounds_alternate: 'rebounds',
  player_assists_alternate: 'assists'
});
const MARKETS = Object.keys(MARKET_STATS);
const MAX_EVENTS_PER_DAY = 2;
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
    if (!MARKET_STATS[row.market] || row.side !== 'over' || !row.player ||
        !Number.isFinite(row.line) || !Number.isInteger(row.odds) || row.odds < -400 ||
        !row.sportsbook || !row.sportsbookKey || !Number.isFinite(Date.parse(row.updatedAt)) ||
        Date.parse(row.updatedAt) > now.valueOf() || now.valueOf() - Date.parse(row.updatedAt) > 5 * 60_000) continue;
    const key = `${row.market}:${playerNameKey(row.player)}:${row.line}`;
    if (!best.has(key) || best.get(key).odds < row.odds) best.set(key, row);
  }
  // Give each covered stat a bounded share of the candidate checks. A single
  // player's many alternate lines must not crowd every other player out.
  return MARKETS.flatMap(market => {
    const players = new Set();
    return [...best.values()].filter(row => row.market === market)
      .sort((a, b) => a.odds - b.odds).filter(row => {
        const key = playerNameKey(row.player);
        if (players.has(key)) return false;
        players.add(key); return true;
      }).slice(0, 4);
  });
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
  if (attempts.length >= MAX_EVENTS_PER_DAY) return { status: 'held', date,
    reason: 'Two-event daily market cap reached', existing: true };
  const schedule = await readEvents('NBA', { apiKey, fetchImpl });
  const event = featuredEvent(schedule.data, now, new Set(attempts.map(row => row.eventId)));
  if (!event) return { status: 'waiting', date, reason: 'No provider-listed NBA game is 30–90 minutes from tipoff' };
  const file = path.join(directory, `nba-${date}-${event.id}.json`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const reserved = { status: 'reserved', date, eventId: event.id, markets: MARKETS,
    at: now.toISOString() };
  try { await fs.writeFile(file, JSON.stringify(reserved), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', date }; throw error; }
  let outcome = reserved;
  try {
    const odds = await reserveOdds({ root, apiKey, fetchImpl, now, cost: MARKETS.length,
      operation: () => readOdds('NBA', event.id, { apiKey, fetchImpl }) });
    const offers = candidateOffers(odds.selections, now);
    const bdlEvent = await readBdlEvent({ event, now, apiKey: bdlKey, fetchImpl });
    if (Date.parse(bdlEvent.datetime) - now.valueOf() < 15 * 60_000)
      throw new Error('NBA league tipoff is too close for a verified pregame post');
    const holds = [];
    let sendAttempted = false;
    for (const offer of offers) {
      try {
        const player = await readPlayer({ name: offer.player, game: bdlEvent,
          apiKey: bdlKey, fetchImpl });
        const stat = MARKET_STATS[offer.market];
        const history = await readHistory({ playerId: player.id, stat,
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
          prop: { ...offer, sport: 'NBA', stat, side: 'over',
            startsAt: bdlEvent.datetime, eventId: event.id,
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

module.exports = { MARKETS, MARKET_STATS, MAX_EVENTS_PER_DAY,
  featuredEvent, candidateOffers, scanNbaAuto };
