'use strict';

const { snapshot, resolvePlayer } = require('./nfl-search');
const { weeklyLogs, STAT_COLUMNS } = require('./nflverse');
const { researchWindows, altLineLadder } = require('./sport-provider');

const SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player';

async function research({ player, stat, line, side = 'over', season, opponent,
  location, alternateLines = [], fetchImpl = fetch, now = Date.now() } = {}) {
  if (!Object.hasOwn(STAT_COLUMNS, stat)) throw new Error('Unsupported NFL statistic');
  const current = await snapshot({ season, fetchImpl, now });
  const match = resolvePlayer(current.players, player);
  const previous = await snapshot({ season: season - 1, fetchImpl, now });
  const logs = weeklyLogs(current.statsCsv, current.scheduleCsv, { season, playerId: match.id, stat })
    .concat(weeklyLogs(previous.statsCsv, current.scheduleCsv, { season: season - 1,
      playerId: match.id, stat }));
  if (!logs.length) throw new Error('No verified completed NFL player games');
  const query = { stat, line, side, season, opponent, location };
  return { sport: 'nfl', player: match.name, playerId: match.id,
    lastTeam: logs[0].team, lastPlayed: logs[0].date,
    sourceUrl: `${SOURCE}/stats_player_week_${season}.csv`,
    attribution: 'Data: nflverse (CC BY 4.0)',
    analysis: researchWindows(logs, query),
    ladder: altLineLadder(logs, query, alternateLines) };
}

module.exports = { sport: 'nfl', stats: Object.keys(STAT_COLUMNS), research };
