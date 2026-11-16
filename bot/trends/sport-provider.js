'use strict';

const { summarize } = require('./analytics');

function researchWindows(logs, { stat, line, side = 'over', season, opponent, location }) {
  if (!Array.isArray(logs) || !stat) throw new Error('Stored game logs and a stat are required');
  const query = { stat, line, side };
  const scoped = logs.filter(game => game.status === 'final' && game.participated === true);
  const select = (filter, limit) => summarize(scoped.filter(filter), { ...query, limit });
  return {
    season: select(game => game.season === String(season)),
    l5: select(() => true, 5), l10: select(() => true, 10),
    l20: select(() => true, 20),
    opponent: opponent ? select(game => game.opponent === opponent) : null,
    homeAway: location ? select(game => game.location === location) : null
  };
}

function altLineLadder(logs, query, lines) {
  if (!Array.isArray(lines) || lines.length > 12 ||
      lines.some(line => !Number.isFinite(line) || line < 0))
    throw new Error('Choose up to twelve valid historical thresholds');
  return [...new Set(lines)].sort((a, b) => a - b)
    .map(line => ({ line, ...researchWindows(logs, { ...query, line }) }));
}

module.exports = { researchWindows, altLineLadder };
