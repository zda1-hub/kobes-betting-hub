const { netUnitsFor, resultFor } = require('./pick-log');
const { isPublishedRow } = require('./recap');
const { verified } = require('./free-pick-results');

function freePickRow(row, freeChannelId = '') {
  const destination = String(row.destination || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const postReference = String(row.post_reference || '');
  const postChannelId = postReference.match(/^https:\/\/discord\.com\/channels\/[^/]+\/([^/]+)\//)?.[1];
  const channelMatch = freeChannelId && postChannelId === freeChannelId;
  return channelMatch || destination.includes('dailyfreeplay');
}

function freePickRecapRows(rows, date, freeChannelId = '') {
  return rows.filter((row) => (
    row.operating_date === date
    && isPublishedRow(row)
    && freePickRow(row, freeChannelId)
  ));
}

function record(rows) {
  const counts = { W: 0, L: 0, P: 0, V: 0, PENDING: 0 };
  for (const row of rows) counts[resultFor(row)] += 1;
  return counts;
}

function recordText(counts) {
  return `${counts.W}-${counts.L}-${counts.P}${counts.V ? `-${counts.V}V` : ''}`;
}

function propTerms(row) {
  return [row.selection, row.published_line, row.published_odds_american ? `(${row.published_odds_american})` : '']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Published prop';
}

function resultMarker(result) {
  if (result === 'W') return '✅';
  if (result === 'L') return '❌';
  if (result === 'P' || result === 'V') return '➖';
  return '⏳';
}

function buildFreePickRecapEmbed({ date, rows, freeChannelId = '' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Recap date must use YYYY-MM-DD.');
  const picks = freePickRecapRows(rows, date, freeChannelId);
  if (!picks.length) throw new Error(`No official free picks are logged for ${date}.`);
  const today = record(picks.filter(verified));
  const overallRows = rows.filter((row) => isPublishedRow(row) && freePickRow(row, freeChannelId) && row.operating_date <= date && verified(row));
  const overall = record(overallRows);
  const pending = picks.filter((row) => !verified(row)).length;
  const todayUnits = picks.filter(verified).map(netUnitsFor);
  const netToday = todayUnits.reduce((sum, value) => sum + value, 0);
  const unitText = todayUnits.length && todayUnits.every((value) => value !== null)
    ? `${netToday >= 0 ? '+' : ''}${netToday.toFixed(2)}u`
    : (todayUnits.length ? 'unavailable (missing published stake or odds)' : 'pending');
  return {
    color: 0x2B90D9,
    title: `Free Picks Recap — ${date}`,
    description: [
      ...picks.map((row) => `${resultMarker(verified(row) ? resultFor(row) : 'PENDING')} ${propTerms(row)}${verified(row) && netUnitsFor(row) !== null ? ` · ${netUnitsFor(row) >= 0 ? '+' : ''}${netUnitsFor(row).toFixed(2)}u` : ''}`),
      '',
      `**Verified today:** ${recordText(today)} · ${unitText}`,
      `**Awaiting verification:** ${pending}`,
      `**Verified overall free-pick record:** ${recordText(overall)}`
    ].join('\n'),
    footer: { text: '21+ | Results use the exact published terms.' },
    timestamp: new Date().toISOString()
  };
}

module.exports = { buildFreePickRecapEmbed, freePickRecapRows, freePickRow, record, recordText, resultMarker };
