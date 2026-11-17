'use strict';

// CFBD's player box score is event based: an absent player/stat row is not
// evidence of a zero. Require an explicit value in each of the team's most
// recent games before publishing a player hit rate for that statistic.
function completeCfbSample(teamLogs, playerId, stat, count = 10) {
  if (!Array.isArray(teamLogs) || !playerId || !stat) return false;
  const games = new Map();
  for (const row of teamLogs) {
    if (row.status !== 'final' || row.participated !== true || !row.gameId) continue;
    const prior = games.get(row.gameId);
    if (!prior || row.date > prior.date) games.set(row.gameId, { gameId: row.gameId, date: row.date });
  }
  const recent = [...games.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, count);
  if (recent.length < 6) return false;
  const values = new Map(teamLogs.filter(row => String(row.playerId) === String(playerId))
    .map(row => [row.gameId, row.stats?.[stat]]));
  return recent.every(game => Number.isFinite(values.get(game.gameId)));
}

module.exports = { completeCfbSample };
