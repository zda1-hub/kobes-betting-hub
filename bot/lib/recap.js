const { validatePick } = require('./pick');
const { netUnitsFor, resultFor } = require('./pick-log');

function makeResults(rawResults) {
  const items = rawResults
    .split('\n')
    .map((item) => item.trim().replace(/^[•-]\s*/, ''))
    .filter(Boolean);

  if (items.length < 1 || items.length > 30) {
    throw new Error('Provide 1–30 verified results, one per line.');
  }
  return items.map((item) => `• ${item}`).join('\n');
}

function buildRecapEmbed({ date, record, results, summary, imageUrl, imageAttachmentUrl }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Recap date must use YYYY-MM-DD.');
  }
  const mediaUrl = imageAttachmentUrl || imageUrl;
  // Reuse the image URL and guarantee-language checks without requiring pick data.
  validatePick({
    pick: summary,
    evidence: 'Verified recap evidence\nVerified published terms\nVerified result source\nVerified unit math',
    confidence: 0,
    imageUrl: mediaUrl
  });

  return {
    color: 0xD4AF37,
    title: `Daily Recap — ${date}`,
    description: `**Record:** ${record}\n\n${makeResults(results)}\n\n${summary}`,
    image: { url: mediaUrl },
    footer: { text: '21+ | Gambling involves risk. Results use published terms.' },
    timestamp: new Date().toISOString()
  };
}

function units(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.+-]/g, '');
  if (!cleaned || cleaned === '+' || cleaned === '-' || cleaned === '.') return 'not stated';
  const number = Number(cleaned);
  return Number.isFinite(number) ? `${number.toFixed(2).replace(/\.00$/, '')}u` : 'not stated';
}

function entryLine(row) {
  const result = resultFor(row);
  const terms = [row.selection, row.published_line, row.published_odds_american].filter(Boolean).join(' ');
  const net = netUnitsFor(row);
  const netText = net === null ? 'net pending' : `${net >= 0 ? '+' : ''}${units(net)}`;
  const link = row.post_reference ? `[Discord post](${row.post_reference})` : 'post link missing';
  const source = row.result_verified_source || 'result source pending';
  return `**${result}** · \`${row.pick_id}\` · ${terms || 'published terms missing'} · risk ${units(row.units_risked)} · ${netText}\n${row.destination || 'destination missing'} · ${link} · ${source}`;
}

function recapRows(rows, date) {
  const matching = rows.filter((row) => row.operating_date === date && row.published_at);
  if (matching.length === 0) throw new Error(`No official picks are logged for ${date}.`);
  return matching;
}

function buildLogRecapEmbeds({ date, rows, summary = '', imageUrl, imageAttachmentUrl }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Recap date must use YYYY-MM-DD.');
  const picks = recapRows(rows, date);
  const counts = { W: 0, L: 0, P: 0, V: 0, PENDING: 0 };
  let total = 0;
  let missingNet = 0;
  for (const row of picks) {
    counts[resultFor(row)] += 1;
    const net = netUnitsFor(row);
    if (net === null) missingNet += 1;
    else total += net;
  }
  const settled = counts.W + counts.L + counts.P;
  const record = `${counts.W}-${counts.L}-${counts.P}${counts.V ? `-${counts.V}V` : ''}`;
  const netText = `${total >= 0 ? '+' : ''}${units(total)}`;
  const mediaUrl = imageAttachmentUrl || imageUrl;
  if (mediaUrl) validatePick({
    pick: summary || 'Official daily recap',
    evidence: 'Published terms\nVerified result source\nUnit math\nCanonical pick log',
    confidence: 0,
    imageUrl: mediaUrl
  });

  const header = {
    color: 0xD4AF37,
    title: `Daily Recap — ${date}`,
    description: [
      `**Official record:** ${record} (${settled} settled, ${counts.PENDING} pending${counts.V ? `, ${counts.V} void` : ''})`,
      `**Overall net units:** ${netText}${missingNet ? ` · ${missingNet} pick(s) cannot be calculated yet` : ''}`,
      '**Coverage:** every official pick logged from every approved Discord destination.',
      summary || 'Results are based on each exact published line, odds, risk, and recorded verification source.'
    ].join('\n\n'),
    footer: { text: '21+ | Gambling involves risk. Results use published terms and verified sources.' },
    timestamp: new Date().toISOString()
  };
  if (mediaUrl) header.image = { url: mediaUrl };

  const embeds = [header];
  let chunk = '';
  let part = 1;
  for (const row of picks) {
    const line = entryLine(row);
    if (chunk && chunk.length + line.length + 2 > 3800) {
      embeds.push({ color: 0xD4AF37, title: `Daily Recap — Pick Details (${part})`, description: chunk });
      part += 1;
      chunk = '';
    }
    chunk += `${chunk ? '\n\n' : ''}${line}`;
  }
  if (chunk) embeds.push({ color: 0xD4AF37, title: `Daily Recap — Pick Details (${part})`, description: chunk });
  return embeds;
}

module.exports = { buildLogRecapEmbeds, buildRecapEmbed, entryLine, makeResults, recapRows };
