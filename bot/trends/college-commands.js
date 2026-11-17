'use strict';

const { createCollegeProvider } = require('./college-provider');

const FOOTER = '21+ | Research only, not a guarantee';
const count = row => `${row.hits}/${row.sample}`;
const enoughGames = logs => new Set(logs.map(row => row.gameId)).size >= 6;
const SYNCING = 'College data is syncing; at least six completed player games are required before showing trends.';

async function runCollegeCommand(command, options, config = {}) {
  const { sport, player, stat, team, opponent } = options;
  if (!['cfb', 'cbb'].includes(sport) ||
      !['prop', 'player', 'matchup', 'ladder'].includes(command))
    throw new Error('Unsupported college Trends request');
  const provider = (config.createProvider || createCollegeProvider)(sport, config);
  const status = await provider.status();
  if (!status.keyConfigured) return 'College data coming soon';
  if (command === 'player') {
    const logs = await provider.logs(player);
    if (!enoughGames(logs)) return SYNCING;
    const ids = new Set(logs.map(row => row.playerId));
    if (ids.size !== 1) throw new Error('Use a player ID to resolve this name');
    return `**Trends-tool · ${sport.toUpperCase()} player history**\n` +
      `${logs[0].player} · last recorded team ${logs[0].team}\n` +
      `Completed games cached: ${new Set(logs.map(row => row.gameId)).size}\n` +
      `Recent completed games: ${logs.slice(0, 5).map(row =>
        `${row.date} vs ${row.opponent} (${Object.entries(row.stats).slice(0, 4)
          .map(([key, value]) => `${key.replaceAll('_', ' ')} ${value}`).join(', ')})`).join(' · ')}\n` +
      `[Source](${logs[0].sourceUrl}). No current line or injury status checked. ${FOOTER}`;
  }
  if (command === 'matchup') {
    const [home, away] = await Promise.all([provider.teamLogs(team), provider.teamLogs(opponent)]);
    const summary = (name, rows) => {
      const games = [...new Set(rows.map(row => row.gameId))];
      return `${name}: ${games.length} cached completed games; last ${rows[0]?.date || 'none'}`;
    };
    return `**Trends-tool · ${sport.toUpperCase()} historical team coverage**\n` +
      `${summary(team, home)}\n${summary(opponent, away)}\n` +
      `These are stored player logs, not a verified upcoming matchup or prediction. ` +
      `Current lines and injuries have not been checked. ${FOOTER}`;
  }
  if (!provider.stats.includes(stat)) throw new Error('That statistic is unavailable for this college sport');
  const lines = command === 'ladder' ? options.lines : [options.line];
  if (!Array.isArray(lines) || !lines.length || lines.some(line => !Number.isFinite(line) || line < 0))
    throw new Error('Choose a valid historical threshold');
  const logs = await provider.logs(player);
  if (!enoughGames(logs)) return SYNCING;
  const season = logs[0].season;
  const result = await provider.research({ player, stat, line: lines[0], season,
    alternateLines: lines });
  const rows = command === 'ladder' ? result.ladder : [{ line: lines[0], ...result.analysis }];
  return `**Trends-tool · ${sport.toUpperCase()} ${command === 'ladder' ? 'historical ladder' : 'prop research'}**\n` +
    `${result.player} · last recorded team ${result.lastTeam}\n` +
    rows.map(row => `${stat.replaceAll('_', ' ')} over ${row.line}: season ${count(row.season)} · ` +
      `L5 ${count(row.l5)} · L10 ${count(row.l10)} · L20 ${count(row.l20)}` +
      (row.opponent?.sample ? ` · vs opponent ${count(row.opponent)}` : '') +
      (row.homeAway?.sample ? ` · home/away ${count(row.homeAway)}` : '')).join('\n') + '\n' +
    `[Completed game logs](${result.sourceUrl}). User-entered thresholds, not live sportsbook odds. ` +
    `Injury status not checked. ${FOOTER}`;
}

module.exports = { runCollegeCommand };
