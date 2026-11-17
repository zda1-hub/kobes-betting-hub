'use strict';

const { analyze } = require('./analytics');
const { parseCsv, weeklyLogs } = require('./nflverse');
const { playerContext, formatContext } = require('./nfl-context');

const STATS_URL = season => `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
const SCHEDULE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
let cached = null;

async function snapshot({ season, fetchImpl = fetch, now = Date.now() }) {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) throw new Error('Invalid NFL season');
  if (cached?.season === season && now - cached.fetchedAtMs < 30 * 60_000) return cached;
  const [statsResponse, scheduleResponse] = await Promise.all([
    fetchImpl(STATS_URL(season), { signal: AbortSignal.timeout(20000) }),
    fetchImpl(SCHEDULE_URL, { signal: AbortSignal.timeout(20000) })
  ]);
  if (!statsResponse.ok || !scheduleResponse.ok) throw new Error('NFL historical feed is unavailable right now');
  const [statsCsv, scheduleCsv] = await Promise.all([statsResponse.text(), scheduleResponse.text()]);
  const players = new Map();
  for (const row of parseCsv(statsCsv)) {
    if (row.season !== String(season) || row.season_type !== 'REG' || !row.player_id || !row.player_display_name) continue;
    players.set(row.player_id, row.player_display_name);
  }
  cached = { season, statsCsv, scheduleCsv, players, fetchedAtMs: now };
  return cached;
}

function resolvePlayer(players, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('en-US');
  if (needle.length < 3) throw new Error('Enter at least three characters of a player name');
  const exact = [...players].filter(([, name]) => name.toLocaleLowerCase('en-US') === needle);
  const matches = exact.length ? exact : [...players].filter(([, name]) => name.toLocaleLowerCase('en-US').includes(needle));
  if (matches.length !== 1) {
    const examples = matches.slice(0, 5).map(([, name]) => name).join(', ');
    throw new Error(matches.length ? `Several players match. Use the full name: ${examples}` : 'Player not found in completed NFL games this season');
  }
  return { id: matches[0][0], name: matches[0][1] };
}

async function research({ player, stat, line, side = 'over', alternateLines = [], season, fetchImpl, now }) {
  if (!Number.isFinite(line) || line < 0 || !['over', 'under', 'at_least'].includes(side))
    throw new Error('Choose a valid line and side');
  if (!Array.isArray(alternateLines) || alternateLines.length > 2 ||
      alternateLines.some(value => !Number.isFinite(value) || value < 0 || value > 1000))
    throw new Error('Choose up to two valid alternate thresholds');
  const data = await snapshot({ season, fetchImpl, now });
  const found = resolvePlayer(data.players, player);
  const logs = weeklyLogs(data.statsCsv, data.scheduleCsv, { season, playerId: found.id, stat });
  if (!logs.length) throw new Error('No completed games with this stat are available for this player');
  let context = null;
  try { context = await playerContext({ season, playerId: found.id, fetchImpl, now }); }
  catch (error) { console.warn('NFL roster/injury context unavailable:', error.message); }
  const comparisons = [...new Set(alternateLines)].filter(value => value !== line)
    .map(value => ({ line: value, analysis: analyze(logs, { stat, line: value, side, season: String(season) }) }));
  return { player: found.name, playerId: found.id, stat, side, line, comparisons, season,
    lastRecordedTeam: logs[0].team, analysis: analyze(logs, { stat, line, side, season: String(season) }),
    context, fetchedAt: new Date(data.fetchedAtMs).toISOString(), sourceUrl: STATS_URL(season), scheduleUrl: SCHEDULE_URL };
}

function formatResearch(result) {
  const { player, stat, side, line, season, analysis, fetchedAt, sourceUrl } = result;
  const row = (label, value) => `${label}: ${value.hits}/${value.sample} hits${value.pushes ? `, ${value.pushes} pushes` : ''}`;
  const alternates = result.comparisons?.length
    ? `Other thresholds (historical only, not sportsbook offers): ${result.comparisons.map(item =>
      `${side.replace('_', ' ')} ${item.line}: ${item.analysis.season.hits}/${item.analysis.season.sample} season, ${item.analysis.l5.hits}/${item.analysis.l5.sample} L5`).join(' · ')}\n`
    : '';
  const recent = `Recent completed games: ${analysis.season.games.slice(0, 5).map(game =>
    `${game.date} ${game.value}`).join(' · ')}\n`;
  return `**Trends-tool · NFL historical research**\n**${player} · ${side.replace('_', ' ')} ${line} ${stat.replaceAll('_', ' ')}**\n` +
    `${row(`${season} season`, analysis.season)} · ${row('L5', analysis.l5)} · ${row('L10', analysis.l10)} · ${row('L20', analysis.l20)}\n` +
    alternates + recent +
    `Last completed game: ${analysis.season.games[0]?.date || 'unavailable'} · Last recorded team: ${result.lastRecordedTeam || 'unavailable'}\n` +
    `${formatContext(result.context)}\n` +
    `Source: [nflverse weekly player stats](${sourceUrl})${result.context ? ` · [roster](${result.context.rosterUrl}) · [injury report](${result.context.injuryUrl})` : ''} (CC BY 4.0). Checked ${fetchedAt}. ` +
    `Final participated games with observed stats only; pushes remain in the denominator. ` +
    `Historical frequency is not a next-game probability. Game-day availability, current sportsbook line and odds are not verified.`;
}

module.exports = { snapshot, resolvePlayer, research, formatResearch };
