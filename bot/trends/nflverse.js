'use strict';

// nflverse weekly player stats are published as CC BY 4.0. This adapter only
// computes historical summaries; it does not verify a current roster or odds.
const BASE = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player';
const SCHEDULE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const STAT_COLUMNS = Object.freeze({
  receptions: 'receptions', receiving_yards: 'receiving_yards',
  rushing_yards: 'rushing_yards', rushing_attempts: 'carries',
  passing_yards: 'passing_yards', passing_touchdowns: 'passing_tds',
  rush_receiving_yards: ['rushing_yards', 'receiving_yards'],
  anytime_touchdown: ['rushing_tds', 'receiving_tds', 'special_teams_tds']
});

function statValue(row, stat) {
  const columns = STAT_COLUMNS[stat];
  if (!columns) throw new Error('Unsupported nflverse statistic');
  const names = Array.isArray(columns) ? columns : [columns];
  if (names.some(name => !Object.hasOwn(row, name))) throw new Error('Unknown nflverse weekly stats schema');
  const values = names.map(name => row[name] === '' ? null : Number(row[name]));
  if (values.some(value => value === null || !Number.isFinite(value))) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function parseCsv(csv) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
    } else value += c;
  }
  if (quoted) throw new Error('Malformed nflverse CSV');
  if (row.length || value) { row.push(value); rows.push(row); }
  const [header, ...data] = rows;
  if (!header) throw new Error('Empty nflverse CSV');
  return data.map(cells => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ''])));
}

function weeklyLogs(csv, schedulesCsv, { season, playerId, stat }) {
  if (!Number.isInteger(season) || season < 1999 || season > 2100 || !playerId ||
      !Object.hasOwn(STAT_COLUMNS, stat)) throw new Error('Valid season, player ID and stat required');
  const rows = parseCsv(csv);
  const completedGames = new Map(parseCsv(schedulesCsv)
    .filter(g => g.season === String(season) && g.game_type === 'REG' &&
      g.gameday && g.home_score !== '' && g.away_score !== '' &&
      Number.isFinite(Number(g.home_score)) && Number.isFinite(Number(g.away_score)))
    .map(g => [g.game_id, g]));
  if (!rows.length || !Object.hasOwn(rows[0], 'game_id'))
    throw new Error('Unknown nflverse weekly stats schema');
  return rows.filter(r => r.season === String(season) && r.player_id === playerId &&
      r.season_type === 'REG' && completedGames.has(r.game_id) && Number.isInteger(Number(r.week)))
    .map(r => ({
      gameId: r.game_id, season: r.season, week: Number(r.week), date: completedGames.get(r.game_id).gameday,
      status: 'final', participated: true,
      playerId: r.player_id, player: r.player_display_name,
      team: r.team, opponent: r.opponent_team,
      location: completedGames.get(r.game_id).home_team === r.team ? 'home' : 'away',
      stats: { [stat]: statValue(r, stat) },
      source: 'nflverse stats_player',
      sourceUrl: `${BASE}/stats_player_week_${season}.csv`
    }))
    .filter(r => Number.isFinite(r.stats[stat]))
    .sort((a, b) => b.week - a.week);
}

async function fetchWeeklyLogs({ season, playerId, stat, fetchImpl = fetch }) {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) throw new Error('Invalid season');
  const url = `${BASE}/stats_player_week_${season}.csv`;
  const [statsResponse, scheduleResponse] = await Promise.all([
    fetchImpl(url, { signal: AbortSignal.timeout(20000) }),
    fetchImpl(SCHEDULE_URL, { signal: AbortSignal.timeout(20000) })
  ]);
  if (!statsResponse.ok || !scheduleResponse.ok)
    throw new Error(`nflverse stats or completed-game schedule unavailable (${statsResponse.status}, ${scheduleResponse.status})`);
  const [csv, schedulesCsv] = await Promise.all([statsResponse.text(), scheduleResponse.text()]);
  return { logs: weeklyLogs(csv, schedulesCsv, { season, playerId, stat }), fetchedAt: new Date().toISOString(), url, scheduleUrl: SCHEDULE_URL };
}

module.exports = { STAT_COLUMNS, statValue, parseCsv, weeklyLogs, fetchWeeklyLogs };
