const { isPublishedRow } = require('./recap');
const { resultFor } = require('./pick-log');
const { verified } = require('./free-pick-results');

function counts(rows) {
  const record = { wins: 0, losses: 0, pushes: 0, voids: 0 };
  for (const row of rows) {
    const result = resultFor(row);
    if (result === 'W') record.wins += 1;
    if (result === 'L') record.losses += 1;
    if (result === 'P') record.pushes += 1;
    if (result === 'V') record.voids += 1;
  }
  return record;
}

function publicResult(row) {
  return {
    id: String(row.pick_id || '').slice(0, 90),
    date: row.operating_date,
    sport: String(row.sport || row.league || '').slice(0, 40),
    selection: String(row.selection || '').slice(0, 180),
    line: String(row.published_line || '').slice(0, 80),
    odds: String(row.published_odds_american || '').slice(0, 24),
    result: resultFor(row),
  };
}

function buildPublicResults(rows, today, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('Expected an operating date.');
  const published = rows.filter((row) => isPublishedRow(row) && /^\d{4}-\d{2}-\d{2}$/.test(row.operating_date || ''));
  const settled = published.filter(verified);
  const recent = [...settled].sort((a, b) =>
    String(b.operating_date).localeCompare(String(a.operating_date))
    || String(b.published_at).localeCompare(String(a.published_at))
  ).slice(0, 50).map(publicResult);
  return {
    generatedAt: now.toISOString(),
    operatingDate: today,
    overall: counts(settled),
    today: counts(settled.filter((row) => row.operating_date === today)),
    pending: published.filter((row) => !verified(row)).length,
    settled: settled.length,
    recent,
  };
}

module.exports = { buildPublicResults };
