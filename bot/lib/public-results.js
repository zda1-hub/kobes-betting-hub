const { isPublishedRow } = require('./recap');
const { resultFor } = require('./pick-log');
const { publicMetadata } = require('../../result-metadata');
const { verified } = require('./free-pick-results');
const { previousDayRecords, previousMstDate } = require('./vip-expert-list');
const { buildWriteupRecord } = require('./writeup-record');

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
  return publicMetadata({
    source: String(row.source_name || '').slice(0, 120),
    id: String(row.pick_id || '').slice(0, 90),
    date: row.operating_date,
    sport: String(row.sport || row.league || '').slice(0, 40),
    selection: String(row.selection || '').slice(0, 180),
    line: String(row.published_line || '').slice(0, 80),
    odds: String(row.published_odds_american || '').slice(0, 24),
    result: resultFor(row),
  });
}

function buildPublicResults(rows, today, now = new Date(), { expertChannelIds = [], writeupChannelIds = [] } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('Expected an operating date.');
  const published = rows.filter((row) => isPublishedRow(row) && /^\d{4}-\d{2}-\d{2}$/.test(row.operating_date || ''));
  const settled = published.filter(verified);
  const ordered = [...settled].sort((a, b) =>
    String(b.operating_date).localeCompare(String(a.operating_date))
    || String(b.published_at).localeCompare(String(a.published_at))
  );
  const recent = ordered.slice(0, 50).map(publicResult);
  const wins = ordered.filter((row) => resultFor(row) === 'W').map(publicResult);
  const expertDate = previousMstDate(now);
  const expertRows = published.filter(row => expertChannelIds.includes(String(row.post_reference).match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/)?.[1]));
  const expertCounts = previousDayRecords(expertRows, expertDate);
  const sourceNames = new Map(expertRows.map(row => [String(row.source_name || '').toLowerCase().replace(/[^a-z0-9]/g, ''), String(row.source_name || '').trim()]));
  const expertRecords = { date: expertDate, experts: [...expertCounts].map(([key, value]) => ({
    source: sourceNames.get(key), wins: value.W, losses: value.L, pushes: value.P, voids: value.V, pending: value.PENDING
  })).sort((a, b) => a.source.localeCompare(b.source, 'en', { sensitivity: 'base' })) };
  return {
    writeupRecord: buildWriteupRecord(published, today, writeupChannelIds.filter(id => !expertChannelIds.includes(id))),
    expertRecords,
    generatedAt: now.toISOString(),
    operatingDate: today,
    trackingSince: published.length ? published.map(row => row.operating_date).sort()[0] : null,
    overall: counts(settled),
    today: counts(settled.filter((row) => row.operating_date === today)),
    pending: published.filter((row) => !verified(row)).length,
    settled: settled.length,
    recent,
    wins,
  };
}

module.exports = { buildPublicResults };
