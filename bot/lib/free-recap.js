const { resultFor } = require('./pick-log');

function freePickRow(row, freeChannelId = '') {
  const destination = String(row.destination || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const postReference = String(row.post_reference || '');
  const postChannelId = postReference.match(/^https:\/\/discord\.com\/channels\/[^/]+\/([^/]+)\//)?.[1];
  const channelMatch = freeChannelId && postChannelId === freeChannelId;
  return channelMatch || destination.includes('dailyfreeplay');
}

function freePickRecapRows(rows, date, freeChannelId = '') {
  return rows.filter((row) => row.operating_date === date && row.published_at && freePickRow(row, freeChannelId));
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
  const today = record(picks);
  const overall = record(rows.filter((row) => freePickRow(row, freeChannelId)));
  return {
    color: 0x2B90D9,
    title: `Free Picks Recap — ${date}`,
    description: [
      ...picks.map((row) => `${resultMarker(resultFor(row))} ${propTerms(row)}`),
      '',
      `**Today:** ${recordText(today)}`,
      `**Overall free-pick record:** ${recordText(overall)}`
    ].join('\n'),
    footer: { text: '21+ | Results use the exact published terms.' },
    timestamp: new Date().toISOString()
  };
}

module.exports = { buildFreePickRecapEmbed, freePickRecapRows, freePickRow, record, recordText, resultMarker };
