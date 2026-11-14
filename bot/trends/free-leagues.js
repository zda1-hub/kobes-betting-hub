'use strict';

// Private research from SportsDataverse releases. Keep publication disabled:
// its CC BY label does not settle upstream league data rights for paid posts.
const { gunzipSync } = require('node:zlib');
const { parseCsv } = require('./nflverse');
const { analyze } = require('./analytics');
const { playerNameKey } = require('./player-name');

const BASE = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download';
const DEFINITIONS = Object.freeze({
  NBA: { tag: 'nba_stats_player_game_logs', file: year => `player_game_logs_${year}.csv`,
    stats: { points: 'pts', rebounds: 'reb', assists: 'ast', threes: 'fg3m', points_assists: null } },
  NHL: { tag: 'nhl_skater_boxscores', file: year => `skater_box_${year}.csv`,
    stats: { goals: 'goals', assists: 'assists', points: 'points', shots_on_goal: 'shots_on_goal', hits: 'hits', blocked_shots: 'blocked_shots' } },
  MLB: { tag: 'mlb_pbp', file: year => `mlb_pbp_${year}.csv.gz`,
    stats: { hits: null, home_runs: null, runs_batted_in: null } }
});
const SCHEDULE_TAG = 'mlb_schedules';
const scheduleUrl = year => `${BASE}/${SCHEDULE_TAG}/mlb_schedule_${year}.csv.gz`;
const releaseUrl = (sport, year) => `${BASE}/${DEFINITIONS[sport].tag}/${DEFINITIONS[sport].file(year)}`;
const cache = new Map();

function* csvRows(text) {
  let header = null, row = [], value = '', quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const c = i === text.length ? '\n' : text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some(cell => cell !== '')) {
        if (!header) header = row;
        else yield Object.fromEntries(header.map((key, index) => [key, row[index] ?? '']));
      }
      row = [];
    } else value += c;
  }
  if (quoted) throw new Error('Malformed sports CSV');
}

function currentSeason(sport, date = new Date()) {
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
  return sport === 'MLB' ? year : year + (month >= (sport === 'NHL' ? 9 : 10) ? 1 : 0);
}

async function readCsv(url, { fetchImpl = fetch, now = Date.now() } = {}) {
  const saved = fetchImpl === fetch ? cache.get(url) : null;
  if (saved && now - saved.at < 30 * 60_000) return saved.rows;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Free sports source unavailable (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 15_000_000) throw new Error('Sports file exceeds safe size');
  const text = url.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  const rows = parseCsv(text);
  if (fetchImpl === fetch) cache.set(url, { at: now, rows });
  return rows;
}

async function readMlbRows(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Free sports source unavailable (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 15_000_000) throw new Error('Sports file exceeds safe size');
  const text = gunzipSync(bytes).toString('utf8');
  if (text.length > 120_000_000) throw new Error('Expanded sports file exceeds safe size');
  return () => csvRows(text);
}

function numeric(value) { return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null; }
function pickPlayer(rows, name, team) {
  const needle = playerNameKey(name);
  if (needle.length < 3) throw new Error('Enter at least three characters of a player name');
  const found = rows.filter(row => playerNameKey(row.player_name) === needle &&
    (!team || (row.team_abbreviation || row.team_abbrev || '').toUpperCase() === team.toUpperCase()));
  const ids = new Set(found.map(row => row.player_id));
  if (!ids.size) throw new Error('Player not found in completed games for this season; use the source display name');
  if (ids.size > 1) throw new Error('Several players match; add the team abbreviation');
  return [...ids][0];
}

function nbaLogs(rows, { name, team, playerId, stat, season, today }) {
  const id = playerId || pickPlayer(rows, name, team);
  return rows.filter(r => r.player_id === id && r.season_type === 'regular-season' &&
    r.game_date < today && ['W', 'L'].includes(r.wl) && numeric(r.min) > 0)
    .map(r => ({ gameId: r.game_id, date: r.game_date, season: String(season), status: 'final', participated: true,
      player: r.player_name, team: r.team_abbreviation, opponent: r.matchup,
      stats: { [stat]: stat === 'points_assists' ?
        (numeric(r.pts) === null || numeric(r.ast) === null ? null : numeric(r.pts) + numeric(r.ast)) :
        numeric(r[DEFINITIONS.NBA.stats[stat]]) } }))
    .filter(r => Number.isFinite(r.stats[stat]));
}

function nhlLogs(rows, { name, team, playerId, stat, season, today }) {
  const id = playerId || pickPlayer(rows, name, team);
  return rows.filter(r => r.player_id === id && r.game_date < today && /^\d{4}02\d+/.test(r.game_id) &&
    r.toi && r.toi !== '00:00')
    .map(r => ({ gameId: r.game_id, date: r.game_date, season: String(season), status: 'final', participated: true,
      player: r.player_name, team: r.team_abbrev, opponent: null,
      stats: { [stat]: numeric(r[DEFINITIONS.NHL.stats[stat]]) } }))
    .filter(r => Number.isFinite(r.stats[stat]));
}

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run']);
function mlbLogs(rows, schedule, { name, stat, season, today }) {
  const needle = playerNameKey(name);
  if (needle.length < 3) throw new Error('Enter a full MLB batter name');
  const final = new Map(schedule.filter(g => g.game_type === 'R' && g.abstract_state === 'Final' &&
    g.game_date < today).map(g => [g.game_pk, g]));
  const iterate = typeof rows === 'function' ? rows : () => rows;
  const ids = new Set();
  for (const r of iterate()) if (final.has(r.game_pk) &&
    playerNameKey(r.description).startsWith(`${needle} `)) ids.add(r.batter_id);
  if (!ids.size) throw new Error('MLB batter not found in final regular-season play-by-play');
  if (ids.size > 1) throw new Error('Ambiguous MLB batter name; use the exact full name');
  const id = [...ids][0], games = new Map();
  for (const r of iterate()) {
    if (r.batter_id !== id || !final.has(r.game_pk)) continue;
    let g = games.get(r.game_pk);
    if (!g) { g = { gameId: r.game_pk, date: final.get(r.game_pk).game_date, season: String(season),
      status: 'final', participated: true, player: name, team: null, opponent: null,
      stats: { hits: 0, home_runs: 0, runs_batted_in: 0 } }; games.set(r.game_pk, g); }
    if (HIT_EVENTS.has(r.event_type)) g.stats.hits++;
    if (r.event_type === 'home_run') g.stats.home_runs++;
    g.stats.runs_batted_in += numeric(r.rbi) || 0;
  }
  return [...games.values()].map(g => ({ ...g, stats: { [stat]: g.stats[stat] } }));
}

async function research({ sport, name, team, stat, line, side = 'over', season, fetchImpl = fetch, now = Date.now() }) {
  sport = String(sport || '').toUpperCase();
  if (!DEFINITIONS[sport] || !Object.hasOwn(DEFINITIONS[sport].stats, stat)) throw new Error('Unsupported sport or stat');
  if (!Number.isFinite(line) || line < 0 || !['over', 'under', 'at_least'].includes(side)) throw new Error('Invalid line or side');
  season ||= currentSeason(sport, new Date(now));
  const sourceUrl = releaseUrl(sport, season), rows = sport === 'MLB' ?
    await readMlbRows(sourceUrl, { fetchImpl }) : await readCsv(sourceUrl, { fetchImpl, now });
  const today = new Date(now).toISOString().slice(0, 10);
  const args = { name, team, stat, season, today };
  const currentLogs = sport === 'NBA' ? nbaLogs(rows, args) : sport === 'NHL' ? nhlLogs(rows, args) :
    mlbLogs(rows, await readCsv(scheduleUrl(season), { fetchImpl, now }), args);
  if (!currentLogs.length) throw new Error('No final participated games with observed stats for this player');
  let logs = currentLogs.map(g => ({ ...g, sourceUrl }));
  let previousSeasonUnavailable = false;
  if (logs.length < 20 && (sport === 'NBA' || sport === 'NHL')) {
    const playerId = pickPlayer(rows, name, team);
    const previousUrl = releaseUrl(sport, season - 1);
    try {
      const previousRows = await readCsv(previousUrl, { fetchImpl, now });
      const previousLogs = (sport === 'NBA' ? nbaLogs : nhlLogs)(previousRows,
        { ...args, playerId, team: null, season: season - 1 });
      const seen = new Set(logs.map(g => g.gameId));
      logs.push(...previousLogs.filter(g => !seen.has(g.gameId)).map(g => ({ ...g, sourceUrl: previousUrl })));
    } catch (error) {
      previousSeasonUnavailable = true;
    }
  }
  const seasonAnalysis = analyze(currentLogs, { stat, line, side, season: String(season) });
  const recentAnalysis = analyze(logs, { stat, line, side });
  const analysis = { ...recentAnalysis, season: seasonAnalysis.season };
  const sourceByGame = new Map(logs.map(g => [g.gameId, g]));
  return { sport, name, team, stat, line, side, season, sourceUrl,
    scheduleUrl: sport === 'MLB' ? scheduleUrl(season) : null,
    checkedAt: new Date(now).toISOString(), previousSeasonUnavailable,
    logs: analysis.l20.games.map(g => ({ ...g, season: sourceByGame.get(g.gameId).season,
      sourceUrl: sourceByGame.get(g.gameId).sourceUrl })), analysis };
}

function toCsv(result) {
  const header = 'sport,player,season,game_date,game_id,stat,value,source_url,checked_at';
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [header, ...result.logs.map(g => [result.sport, result.name, g.season, g.date, g.gameId,
    result.stat, g.value, g.sourceUrl, result.checkedAt].map(quote).join(','))].join('\n') + '\n';
}

module.exports = { currentSeason, releaseUrl, nbaLogs, nhlLogs, mlbLogs, research, toCsv, csvRows };
