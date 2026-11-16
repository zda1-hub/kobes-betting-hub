'use strict';

const { researchWindows, altLineLadder } = require('./sport-provider');

const STATS = Object.freeze({
  cfb: ['passing_yards', 'rushing_yards', 'receiving_yards', 'receptions',
    'rush_receiving_yards', 'anytime_touchdown'],
  cbb: ['points', 'rebounds', 'assists', 'threes', 'pra']
});

async function requestCached({ baseUrl, secret, path, body, fetchImpl = fetch }) {
  if (!/^https:\/\//.test(baseUrl || '') || !secret) throw new Error('College cache is not configured');
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${secret}`, accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`College cache unavailable: ${result.error || response.status}`);
  return result;
}

function createCollegeProvider(sport, { baseUrl, secret, fetchImpl } = {}) {
  if (!STATS[sport]) throw new Error('Unsupported college sport');
  return {
    sport, stats: STATS[sport],
    async status() {
      return requestCached({ baseUrl, secret, path: '/api/trends/college/status', fetchImpl });
    },
    async refresh(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Date required');
      return requestCached({ baseUrl, secret, path: '/api/trends/college/refresh', fetchImpl,
        body: { sport, date } });
    },
    async logs(player) {
      const params = new URLSearchParams({ sport, player: String(player || '') });
      const data = await requestCached({ baseUrl, secret,
        path: `/api/trends/college/logs?${params}`, fetchImpl });
      if (!Array.isArray(data.logs)) throw new Error('College cache returned no game-log array');
      const ids = new Set(data.logs.map(row => row.playerId));
      if (ids.size > 1) throw new Error('Ambiguous college player name; use player ID');
      return data.logs;
    },
    async teamLogs(team) {
      const params = new URLSearchParams({ sport, team: String(team || '') });
      const data = await requestCached({ baseUrl, secret,
        path: `/api/trends/college/team?${params}`, fetchImpl });
      if (!Array.isArray(data.logs)) throw new Error('College cache returned no team game-log array');
      return data.logs;
    },
    async research({ player, stat, line, side = 'over', season,
      opponent, location, alternateLines = [] }) {
      if (!STATS[sport].includes(stat)) throw new Error('Unsupported college statistic');
      const logs = await this.logs(player);
      if (!logs.length) throw new Error('No cached final player games');
      return { sport, player: logs[0].player, playerId: logs[0].playerId,
        lastTeam: logs[0].team, lastPlayed: logs[0].date,
        sourceUrl: logs[0].sourceUrl,
        analysis: researchWindows(logs, { stat, line, side, season, opponent, location }),
        ladder: altLineLadder(logs, { stat, side, season, opponent, location }, alternateLines) };
    }
  };
}

module.exports = { STATS, createCollegeProvider };
