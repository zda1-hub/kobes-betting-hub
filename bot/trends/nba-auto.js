'use strict';

// One budgeted NBA points market per Pacific day. The bot never manufactures
// a daily post: no exact quote, historical sample, roster match, or explicit
// Available entry in the official NBA report means no member-facing send.
const fs = require('node:fs/promises');
const path = require('node:path');
const { events, eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const { research } = require('./free-leagues');
const { nbaAvailability } = require('./nba-availability');
const { publishVerifiedCandidate } = require('./verified-publisher');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');
const { playerNameKey } = require('./player-name');
const { upcomingEventStatus } = require('../lib/event-timing');

const MARKET = 'player_points_alternate';
const MIN_BEFORE_MS = 30 * 60_000;
const MAX_BEFORE_MS = 90 * 60_000;

function featuredEvent(rows, now) {
  const date = localParts(now, TIME_ZONE).date;
  return (rows || []).filter(row => row?.id &&
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
  return [...best.values()].sort((a, b) => b.odds - a.odds).slice(0, 12);
}

function rosterPacket(offer, event) {
  return { pick_id: `trends-nba-${event.id}`, source: { text: 'NBA' }, analysis: { extraction: {
    sport: 'NBA', event: `${event.away_team} at ${event.home_team}`,
    player_name: offer.player, selection: `${offer.player} over ${offer.line} points`,
    plays: [{ player_name: offer.player, event: `${event.away_team} at ${event.home_team}`,
      selection: `${offer.player} over ${offer.line} points` }]
  } } };
}

async function scanNbaAuto({ root, apiKey, channelId, channelFor, now = new Date(),
  fetchImpl = fetch, readEvents = events, readOdds = eventAlternateOdds,
  readHistory = research, readAvailability = nbaAvailability,
  verifyRoster = upcomingEventStatus, publish = publishVerifiedCandidate,
  reserveOdds = withOddsBudget } = {}) {
  if (!root || !apiKey || !channelId || typeof channelFor !== 'function')
    throw new Error('NBA trend automation requires persistent storage, Odds API and private channel');
  const date = localParts(now, TIME_ZONE).date;
  const file = path.join(root, 'trends-auto', `nba-${date}.json`);
  let existing;
  try { existing = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) return { ...existing, existing: true };
  const schedule = await readEvents('NBA', { apiKey, fetchImpl });
  const event = featuredEvent(schedule.data, now);
  if (!event) return { status: 'waiting', date, reason: 'No provider-listed NBA game is 30–90 minutes from tipoff' };
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const reserved = { status: 'reserved', date, eventId: event.id, market: MARKET,
    at: now.toISOString() };
  try { await fs.writeFile(file, JSON.stringify(reserved), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', date }; throw error; }
  let outcome = reserved;
  try {
    const odds = await reserveOdds({ root, apiKey, fetchImpl, now, operation: () =>
      readOdds('NBA', event.id, { apiKey, fetchImpl, market: MARKET }) });
    const offers = candidateOffers(odds.selections, now);
    const holds = [];
    let sendAttempted = false;
    for (const offer of offers) {
      try {
        const history = await readHistory({ sport: 'NBA', name: offer.player,
          stat: 'points', line: offer.line, side: 'over', now: now.valueOf(), fetchImpl });
        if (history.analysis.season.sample < 10 || history.analysis.l20.sample < 20 ||
            history.analysis.season.hitRate < 0.8) {
          holds.push('insufficient or below-threshold history'); continue;
        }
        const roster = await verifyRoster(rosterPacket(offer, event), { now, fetchImpl });
        if (roster.status !== 'UPCOMING' || !roster.athlete ||
            Math.abs(Date.parse(roster.eventStart) - Date.parse(event.commence_time)) > 5 * 60_000 ||
            ![event.home_team, event.away_team].some(team => playerNameKey(team) === playerNameKey(roster.playerTeam))) {
          holds.push('event roster or start time unverified'); continue;
        }
        const availability = await readAvailability({ player: offer.player, now, fetchImpl });
        if (availability.status !== 'confirmed-active') {
          holds.push('player not explicitly Available on official NBA report'); continue;
        }
        const teamName = roster.playerTeam;
        const opponent = playerNameKey(teamName) === playerNameKey(event.home_team) ? event.away_team : event.home_team;
        const candidate = { player: offer.player, analysis: history.analysis,
          analysisSource: history.sourceUrl, analysisCheckedAt: history.checkedAt, availability,
          prop: { ...offer, sport: 'NBA', stat: 'points', side: 'over',
            startsAt: event.commence_time, eventId: event.id,
            teamId: teamName, opponentId: opponent, available: true, source: 'The Odds API',
            rosterVerified: true, rosterVerifiedAt: now.toISOString(), participationVerified: true } };
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

module.exports = { MARKET, featuredEvent, candidateOffers, rosterPacket, scanNbaAuto };
