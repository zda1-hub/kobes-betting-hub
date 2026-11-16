'use strict';

// Conditional, budgeted NFL publication using the existing Odds API plan and
// attributed nflverse releases. No missing injury row is called a confirmed
// game-day active designation.
const fs = require('node:fs/promises');
const path = require('node:path');
const { events, eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const { snapshot: nflSnapshot } = require('./nfl-search');
const { snapshot: contextSnapshot, sourceFresh } = require('./nfl-context');
const { parseCsv, weeklyLogs } = require('./nflverse');
const { researchWindows } = require('./sport-provider');
const { assertEvidence, publishVerifiedCandidate } = require('./verified-publisher');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');
const { playerNameKey } = require('./player-name');

const TERMS_URL = 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md';
const MARKET_STATS = Object.freeze({
  player_receptions_alternate: 'receptions',
  player_reception_yds_alternate: 'receiving_yards',
  player_rush_yds_alternate: 'rushing_yards'
});
const MARKETS = Object.keys(MARKET_STATS);
const TEAM_NAMES = Object.freeze({
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers', LA: 'Los Angeles Rams', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders'
});
const MAX_EVENTS_PER_DAY = 2;
const MAX_POSTS_PER_DAY = 2;

function seasonFor(instant) {
  // NFL games through February belong to the previous calendar season.
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(instant));
  return instant.getUTCMonth() < 2 ? year - 1 : year;
}

function featuredEvent(rows, now, skipped = new Set()) {
  const date = localParts(now, TIME_ZONE).date;
  return (rows || []).filter(row => /^[a-zA-Z0-9_-]{8,80}$/.test(row?.id || '') &&
    !skipped.has(row.id) && Number.isFinite(Date.parse(row.commence_time)) &&
    belongsToServiceDate(row.commence_time, date) &&
    Date.parse(row.commence_time) - now.valueOf() >= 30 * 60_000 &&
    Date.parse(row.commence_time) - now.valueOf() <= 90 * 60_000)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))[0] || null;
}

function exactScheduledGame(scheduleCsv, event) {
  const gameDate = localParts(event.commence_time, 'America/New_York').date;
  const matches = parseCsv(scheduleCsv).filter(row => row.game_type === 'REG' &&
    row.gameday === gameDate && TEAM_NAMES[row.home_team] === event.home_team &&
    TEAM_NAMES[row.away_team] === event.away_team && Number.isInteger(Number(row.week)) &&
    Number(row.week) > 0);
  if (matches.length !== 1) throw new Error('NFL event does not match one current nflverse schedule game');
  return { ...matches[0], week: Number(matches[0].week) };
}

function candidateOffers(rows, now) {
  const byPlayer = new Map();
  for (const row of rows || []) {
    if (!MARKET_STATS[row.market] || row.side !== 'over' || !row.player ||
        !Number.isFinite(row.line) || !Number.isInteger(row.odds) || row.odds < -400 ||
        !row.sportsbook || !row.sportsbookKey || !Number.isFinite(Date.parse(row.updatedAt)) ||
        Date.parse(row.updatedAt) > now.valueOf() || now.valueOf() - Date.parse(row.updatedAt) > 5 * 60_000) continue;
    const key = `${row.market}:${playerNameKey(row.player)}`;
    if (!byPlayer.has(key) || byPlayer.get(key).odds < row.odds) byPlayer.set(key, row);
  }
  return MARKETS.flatMap(market => [...byPlayer.values()].filter(row => row.market === market)
    .sort((a, b) => a.odds - b.odds).slice(0, 4));
}

function findPlayer(players, name) {
  const matches = [...players].filter(([, display]) => playerNameKey(display) === playerNameKey(name));
  if (matches.length !== 1) throw new Error('NFL player identity is missing or ambiguous');
  return { id: matches[0][0], name: matches[0][1] };
}

function verifiedAvailability(context, { season, week, playerId, team, now }) {
  if (!sourceFresh(context.rosterUpdatedAt, now.valueOf()) ||
      !sourceFresh(context.injuryUpdatedAt, now.valueOf()))
    throw new Error('NFL roster or injury release is stale');
  const roster = context.rosters.filter(row => row.season === String(season) &&
    row.gsis_id === playerId && Number(row.week) === week && row.team === team);
  if (roster.length !== 1 || roster[0].status !== 'ACT')
    throw new Error('Player is not on one active roster for this NFL game week');
  if (!context.injuries.some(row => row.season === String(season) && Number(row.week) === week))
    throw new Error('NFL injury feed has no current game week');
  if (context.injuries.some(row => row.season === String(season) && Number(row.week) === week &&
      row.gsis_id === playerId))
    throw new Error('Player has a current-week injury report entry');
  return { status: 'active-roster-no-listed-injury', checkedAt: now.toISOString(),
    sourceUrl: context.injuryUrl, sourceUpdatedAt: context.injuryUpdatedAt,
    rosterSourceUrl: context.rosterUrl, rosterUpdatedAt: context.rosterUpdatedAt,
    gameWeek: week, rosterWeek: week, injuryFeedWeek: week, rightsUrl: TERMS_URL };
}

function historicalAnalysis(currentCsv, priorCsv, schedulesCsv, { season, playerId, stat, line, opponent, location }) {
  const logs = weeklyLogs(currentCsv, schedulesCsv, { season, playerId, stat })
    .concat(weeklyLogs(priorCsv, schedulesCsv, { season: season - 1, playerId, stat }));
  return researchWindows(logs, { stat, line, side: 'over', season, opponent, location });
}

async function scanNflAuto({ root, apiKey, channelId, channelFor, now = new Date(), fetchImpl = fetch,
  readEvents = events, readOdds = eventAlternateOdds, readNfl = nflSnapshot,
  readContext = contextSnapshot, publish = publishVerifiedCandidate,
  reserveOdds = withOddsBudget } = {}) {
  if (!root || !apiKey || !channelId || typeof channelFor !== 'function')
    throw new Error('NFL automation requires storage, Odds API and a private channel');
  const date = localParts(now, TIME_ZONE).date;
  const directory = path.join(root, 'trends-auto');
  let files = [];
  try { files = (await fs.readdir(directory)).filter(name => name.startsWith(`nfl-${date}-`) && name.endsWith('.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const attempts = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))));
  const terminal = attempts.find(row => ['reserved', 'needs_reconciliation'].includes(row.status));
  if (terminal) return { ...terminal, existing: true };
  if (attempts.filter(row => row.status === 'published').length >= MAX_POSTS_PER_DAY ||
      attempts.length >= MAX_EVENTS_PER_DAY)
    return { status: 'complete', date, reason: 'NFL daily event or publication cap reached', existing: true };
  const schedule = await readEvents('NFL', { apiKey, fetchImpl });
  const event = featuredEvent(schedule.data, now, new Set(attempts.map(row => row.eventId)));
  if (!event) return { status: 'waiting', date, reason: 'No NFL game 30–90 minutes from kickoff' };
  const file = path.join(directory, `nfl-${date}-${event.id}.json`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const reserved = { status: 'reserved', date, eventId: event.id, at: now.toISOString() };
  try { await fs.writeFile(file, JSON.stringify(reserved), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', date }; throw error; }
  let outcome = reserved;
  try {
    const season = seasonFor(now);
    const [current, prior, context] = await Promise.all([
      readNfl({ season, fetchImpl, now: now.valueOf() }),
      readNfl({ season: season - 1, fetchImpl, now: now.valueOf() }),
      readContext({ season, fetchImpl, now: now.valueOf() })
    ]);
    const game = exactScheduledGame(current.scheduleCsv, event);
    const odds = await reserveOdds({ root, apiKey, fetchImpl, now, cost: MARKETS.length,
      operation: () => readOdds('NFL', event.id, { apiKey, fetchImpl }) });
    const offers = candidateOffers(odds.selections, now);
    const qualified = []; const holds = [];
    for (const offer of offers) {
      try {
        const player = findPlayer(current.players, offer.player);
        const teamRows = context.rosters.filter(row => row.season === String(season) &&
          row.gsis_id === player.id && Number(row.week) === game.week && row.status === 'ACT' &&
          [game.home_team, game.away_team].includes(row.team));
        if (teamRows.length !== 1)
          throw new Error('NFL player team does not match this game');
        const team = teamRows[0].team;
        const availability = verifiedAvailability(context, { season, week: game.week, playerId: player.id,
          team, now });
        const stat = MARKET_STATS[offer.market];
        const analysis = historicalAnalysis(current.statsCsv, prior.statsCsv, current.scheduleCsv,
          { season, playerId: player.id, stat, line: offer.line,
            opponent: team === game.home_team ? game.away_team : game.home_team,
            location: team === game.home_team ? 'home' : 'away' });
        if (analysis.season.sample < 8 || analysis.l20.sample < 20 || analysis.season.hitRate < 0.8)
          throw new Error('Insufficient or below-threshold NFL completed games');
        const candidate = { player: player.name, playerId: player.id, analysis,
          analysisSource: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
          analysisCheckedAt: now.toISOString(), availability,
          rights: { history: 'commercial-use-confirmed', availability: 'commercial-use-confirmed', termsUrl: TERMS_URL },
          prop: { ...offer, sport: 'NFL', stat, side: 'over', startsAt: event.commence_time,
            eventId: event.id, teamId: TEAM_NAMES[team],
            location: team === game.home_team ? 'home' : 'away',
            opponentId: TEAM_NAMES[team === game.home_team ? game.away_team : game.home_team],
            available: true, source: 'The Odds API', rosterVerified: true,
            rosterVerifiedAt: now.toISOString(), participationVerified: false,
            preGameAvailabilityChecked: true } };
        const gate = assertEvidence(candidate, now.valueOf());
        qualified.push({ candidate, score: gate.consistencyScore });
      } catch (error) { holds.push(error.message); }
    }
    qualified.sort((a, b) => b.score - a.score ||
      b.candidate.analysis.season.hitRate - a.candidate.analysis.season.hitRate);
    if (qualified.length) {
      try {
        const receipt = await publish({ root, candidate: qualified[0].candidate, channelId, channelFor, now });
        outcome = { status: 'published', date, eventId: event.id, messageId: receipt.messageId,
          candidateId: receipt.id, checkedOffers: offers.length, qualifiedOffers: qualified.length };
      } catch (error) {
        outcome = { status: 'needs_reconciliation', date, eventId: event.id, error: error.message };
      }
    } else outcome = { status: 'held', date, eventId: event.id,
      checkedOffers: offers.length, qualifiedOffers: 0, reasons: [...new Set(holds)].slice(0, 8) };
  } catch (error) {
    outcome = error.message.includes('Uncertain Trends send') ?
      { status: 'needs_reconciliation', date, eventId: event.id, error: error.message } :
      { status: 'held', date, eventId: event.id, error: error.message };
  }
  await fs.writeFile(file, JSON.stringify(outcome, null, 2), { mode: 0o600 });
  return outcome;
}

module.exports = { TEAM_NAMES, MARKET_STATS, MARKETS, seasonFor, featuredEvent,
  exactScheduledGame, candidateOffers, findPlayer, verifiedAvailability,
  historicalAnalysis, scanNflAuto };
