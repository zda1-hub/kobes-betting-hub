const { isPublishedRow } = require('./recap');
const { netUnitsFor, resultFor } = require('./pick-log');

const SETTLED = new Set(['W', 'L', 'P', 'V']);

function freeRows(rows, channelId) {
  if (!/^\d+$/.test(String(channelId || ''))) return [];
  return rows.filter((row) => {
    if (!isPublishedRow(row) || !/^\d{4}-\d{2}-\d{2}$/.test(row.operating_date || '')) return false;
    const channel = String(row.post_reference || '').match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/)?.[1];
    return channel === channelId;
  });
}

function verified(row) {
  return SETTLED.has(resultFor(row))
    && Boolean(String(row.result_verified_source || '').trim())
    && Number.isFinite(Date.parse(row.result_verified_at || ''));
}

function counts(rows) {
  const result = { wins: 0, losses: 0, pushes: 0, voids: 0 };
  for (const row of rows) {
    const outcome = resultFor(row);
    if (outcome === 'W') result.wins += 1;
    if (outcome === 'L') result.losses += 1;
    if (outcome === 'P') result.pushes += 1;
    if (outcome === 'V') result.voids += 1;
  }
  return result;
}

function publicWin(row) {
  const units = netUnitsFor(row);
  return {
    date: row.operating_date,
    selection: String(row.selection || '').slice(0, 180),
    line: String(row.published_line || '').slice(0, 80),
    odds: String(row.published_odds_american || '').slice(0, 24),
    netUnits: Number.isFinite(units) && units > 0 ? Math.round(units * 100) / 100 : null,
    postUrl: row.post_reference,
  };
}

function buildFreePickResults(rows, today, channelId, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('Expected an operating date.');
  const published = freeRows(rows, channelId);
  const settled = published.filter(verified);
  const wins = settled.filter((row) => resultFor(row) === 'W');
  const recentWins = [...wins].sort((a, b) =>
    String(b.operating_date).localeCompare(String(a.operating_date))
    || String(b.published_at).localeCompare(String(a.published_at))
  ).slice(0, 5).map(publicWin);
  const bestWins = wins.map(publicWin).filter((row) => row.netUnits !== null)
    .sort((a, b) => b.netUnits - a.netUnits || b.date.localeCompare(a.date)).slice(0, 3);
  return {
    generatedAt: now.toISOString(), operatingDate: today,
    overall: counts(settled),
    today: counts(settled.filter((row) => row.operating_date === today)),
    pending: published.filter((row) => !verified(row)).length,
    recentWins, bestWins,
  };
}

module.exports = { buildFreePickResults, freeRows, verified };
