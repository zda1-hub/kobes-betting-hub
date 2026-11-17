'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bdl = require('./bdl-nba');
const { snapshot: nflSnapshot } = require('./nfl-search');
const { parseCsv, statValue, STAT_COLUMNS } = require('./nflverse');
const { seasonFor, TEAM_NAMES } = require('./nfl-auto');
const { serviceDate } = require('./bulk-panel');
const { buildResult, formatReport } = require('./bulk-report');
const { currentMarket } = require('./current-market');
const rankSnapshot = require('./rank-snapshot');
const { lookupRank } = require('./team-ranks');

const NBA_FIELDS = Object.freeze({ points: ['pts'], rebounds: ['reb'], assists: ['ast'],
  threes: ['fg3m'], pra: ['pts', 'reb', 'ast'], points_rebounds: ['pts', 'reb'],
  points_assists: ['pts', 'ast'], rebounds_assists: ['reb', 'ast'] });
const NBA_SEASON = now => now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const queues = new Map();

function nbaValue(row, stat) {
  const fields = NBA_FIELDS[stat];
  if (!fields || !fields.every(field => Number.isFinite(row[field]))) return null;
  return fields.reduce((sum, field) => sum + row[field], 0);
}
function nbaLogs(rows, { today, season }) {
  const byPlayer = new Map();
  for (const row of rows) {
    if (!row.player?.id || row.game?.season !== season ||
        row.game?.status_state !== 'final' || row.game.postseason !== false ||
        row.game.date >= today || !(Number.parseFloat(row.min) > 0)) continue;
    const stats = Object.fromEntries(Object.keys(NBA_FIELDS).map(stat => [stat, nbaValue(row, stat)]));
    const log = { gameId: String(row.game.id), date: row.game.date,
      season: String(season), status: 'final', participated: true,
      playerId: String(row.player.id), position: row.player.position || null,
      teamId: row.team?.id, opponentId: row.team?.id === row.game.home_team_id ?
        row.game.visitor_team_id : row.game.home_team_id, stats };
    if (!byPlayer.has(log.playerId)) byPlayer.set(log.playerId, []);
    byPlayer.get(log.playerId).push(log);
  }
  return byPlayer;
}
async function fetchNbaStats({ playerIds, apiKey, root, now = new Date(), fetchImpl = fetch }) {
  const ids = [...new Set(playerIds.map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  if (!ids.length) return [];
  const season = NBA_SEASON(now);
  const today = serviceDate(now);
  const signature = crypto.createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 20);
  const file = path.join(root, 'trends', 'bulk-nba', `${today}-${signature}.json`);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (queues.has(file)) return queues.get(file);
  const task = (async () => {
    const out = [];
    for (let start = 0; start < ids.length; start += 50) {
      const group = ids.slice(start, start + 50);
      let cursor;
      for (let page = 0; page < 100; page++) {
        const params = new URLSearchParams({ per_page: '100', season_type: 'regular' });
        params.append('seasons[]', String(season));
        for (const id of group) params.append('player_ids[]', String(id));
        if (cursor !== undefined) params.set('cursor', String(cursor));
        const body = await bdl.request(`/v1/stats?${params}`, { apiKey, fetchImpl });
        out.push(...body.data);
        const next = body.meta.next_cursor;
        if (next === null || next === undefined) break;
        if (String(next) === String(cursor)) throw new Error('NBA bulk stats cursor did not advance');
        cursor = next;
        if (page === 99) throw new Error('NBA bulk stats exceeded bounded pagination');
      }
    }
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(out), { mode: 0o600 });
    await fs.rename(temp, file);
    return out;
  })();
  queues.set(file, task);
  try { return await task; } finally { queues.delete(file); }
}

function nflLogs({ statsCsv, scheduleCsv, season, playerIds }) {
  const ids = new Set(playerIds);
  const games = new Map(parseCsv(scheduleCsv).filter(row => row.season === String(season) &&
    row.game_type === 'REG' && row.gameday && row.home_score !== '' && row.away_score !== '')
    .map(row => [row.game_id, row]));
  const out = new Map();
  for (const row of parseCsv(statsCsv)) {
    if (!ids.has(row.player_id) || row.season !== String(season) ||
        row.season_type !== 'REG' || !games.has(row.game_id)) continue;
    const stats = {};
    for (const stat of ['passing_yards', 'rushing_yards', 'receiving_yards',
      'receptions', 'rush_receiving_yards', 'anytime_touchdown']) {
      try { stats[stat] = statValue(row, stat); }
      catch { stats[stat] = null; }
    }
    const log = { gameId: row.game_id, date: games.get(row.game_id).gameday,
      season: row.season, status: 'final', participated: true,
      playerId: row.player_id, team: row.team, opponent: row.opponent_team,
      position: row.position_group || row.position || null, stats };
    if (!out.has(row.player_id)) out.set(row.player_id, []);
    out.get(row.player_id).push(log);
  }
  return out;
}

function opponentFor(state, team) {
  const game = state.games.find(row => row.home_team === team.name || row.away_team === team.name);
  if (!game) return null;
  const opponent = game.home_team === team.name ? game.away_team : game.home_team;
  const found = state.teams.find(row => row.name === opponent);
  return found?.value || Object.entries(TEAM_NAMES).find(([, full]) => full === opponent)?.[0] ||
    (['CFB', 'CBB'].includes(state.sport) ? opponent : null);
}
async function researchBulk(state, { root, bdlKey, oddsKey, now = new Date(), fetchImpl = fetch,
  rankLookup = null, minimumRate = 0.8, requireAny80 = true } = {}) {
  if (serviceDate(now) !== state.serviceDate) throw new Error('Today’s slate reset at midnight PT');
  if (!['NBA', 'NFL', 'CFB', 'CBB'].includes(state.sport))
    throw new Error('This sport is not ready for bulk research');
  const teams = state.selectedTeams.includes('all') ? state.teams :
    state.teams.filter(row => state.selectedTeams.includes(row.value));
  const players = state.selectedPlayers.includes('all') ? state.players :
    state.players.filter(row => state.selectedPlayers.includes(row.value));
  const stats = state.selectedStats;
  if (!teams.length || !players.length || !stats.length) throw new Error('Choose teams, players and stats');
  let logsByPlayer;
  const sheet = (rankLookup || ['CFB', 'CBB'].includes(state.sport)) ? null : await rankSnapshot.load(root, state.sport,
    rankSnapshot.previousSunday(now));
  const findRank = rankLookup || (query => sheet ? lookupRank(sheet, query) : null);
  if (state.sport === 'NBA') {
    const rows = await fetchNbaStats({ playerIds: players.map(row => row.value),
      apiKey: bdlKey, root, now, fetchImpl });
    logsByPlayer = nbaLogs(rows, { today: state.serviceDate, season: NBA_SEASON(now) });
  } else if (state.sport === 'NFL') {
    const season = seasonFor(now);
    const snap = await nflSnapshot({ season, fetchImpl, now: now.valueOf() });
    logsByPlayer = nflLogs({ statsCsv: snap.statsCsv, scheduleCsv: snap.scheduleCsv,
      season, playerIds: players.map(row => row.value) });
  } else {
    logsByPlayer = new Map();
    for (const team of teams) for (const log of state.collegeLogsByTeam?.get(team.value) || []) {
      if (log.status !== 'final' || log.participated !== true) continue;
      if (!logsByPlayer.has(log.playerId)) logsByPlayer.set(log.playerId, []);
      logsByPlayer.get(log.playerId).push(log);
    }
  }
  const rows = [];
  let oddsCredits = 0;
  for (const player of players) {
    const team = teams.find(row => row.value === player.team);
    if (!team) continue;
    const opponentAbbr = opponentFor(state, team);
    for (const stat of stats) {
      let quote = null;
      if (['NBA', 'NFL'].includes(state.sport) && state.line !== null && oddsKey &&
          players.length * stats.length <= 3) {
        try {
          const market = await currentMarket({ root, apiKey: oddsKey, sport: state.sport,
            team: team.name, player: player.label, stat, side: 'over', line: state.line,
            now, fetchImpl });
          oddsCredits++;
          quote = market.offers[0] || null;
        } catch (error) {
          console.warn('Bulk exact quote unavailable; showing calculated line:', error.message);
        }
      }
      const rank = findRank({ sport: state.sport, opponentAbbr,
        position: player.position, stat });
      const result = buildResult({ sport: state.sport, player: player.label,
        teamAbbr: team.value, teamName: ['CFB', 'CBB'].includes(state.sport) ? '' :
          team.name.split(' ').at(-1), opponentAbbr,
        stat, logs: logsByPlayer.get(player.value) || [],
        selectedWindow: state.window, line: state.line,
        odds: quote?.odds ?? null, oddsSource: quote ? 'The Odds API' : null,
        minimumRate, requireAny80,
        position: player.position, opponentRank: rank?.rank ?? null,
        rankTeams: rank?.teams ?? null, dataDate: rank?.dataDate ?? null });
      if (result) rows.push(result);
    }
  }
  return { rows, messages: formatReport(rows), oddsCredits };
}

module.exports = { NBA_FIELDS, nbaValue, nbaLogs, nflLogs, fetchNbaStats,
  opponentFor, researchBulk };
