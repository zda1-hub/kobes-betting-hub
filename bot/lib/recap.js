const { validatePick } = require('./pick');

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

module.exports = { buildRecapEmbed, makeResults };
