const BLOCKED_PHRASES = [
  /\block\b/i,
  /can't lose/i,
  /cannot lose/i,
  /free money/i,
  /guaranteed/i,
  /risk[- ]free/i
];

const urlPattern = /^https?:\/\/[^\s]+$/i;

function listFromEnv(value) {
  return new Set((value || '').split(',').map((item) => item.trim()).filter(Boolean));
}

function makeEvidence(rawEvidence) {
  const items = rawEvidence
    .split(/[\n;]/)
    .map((item) => item.trim().replace(/^✅\s*/, ''))
    .filter(Boolean);

  if (items.length < 4 || items.length > 8) {
    throw new Error('Provide 4–8 evidence points, one per line.');
  }

  return items.map((item) => `✅ ${item}`).join('\n');
}

function validatePick({ pick, evidence, confidence, imageUrl, imageAttachmentUrl, sourceUrl }) {
  const combined = [pick, evidence].join(' ');
  if (BLOCKED_PHRASES.some((pattern) => pattern.test(combined))) {
    throw new Error('Remove guarantee-style language before publishing.');
  }
  const mediaUrl = imageAttachmentUrl || imageUrl;
  if (!mediaUrl || !urlPattern.test(mediaUrl)) {
    throw new Error('Attach an approved image/GIF or provide an http:// or https:// image URL.');
  }
  if (sourceUrl && !urlPattern.test(sourceUrl)) {
    throw new Error('Source URL must begin with http:// or https://.');
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 10) {
    throw new Error('Confidence must be a number from 0 to 10.');
  }

  return makeEvidence(evidence);
}

function buildPickEmbed({ pickNumber, sport, pick, evidence, confidence, imageUrl, imageAttachmentUrl, sourceUrl }) {
  const formattedEvidence = validatePick({ pick, evidence, confidence, imageUrl, imageAttachmentUrl, sourceUrl });
  const mediaUrl = imageAttachmentUrl || imageUrl;
  const numberedTitle = pickNumber ? `#${pickNumber} • ${(sport || 'pick').toUpperCase()}\n${pick}` : pick;
  const embed = {
    color: 0xD4AF37,
    title: numberedTitle,
    description: `${formattedEvidence}\n\n⭐ **Confidence: ${confidence.toFixed(1)}/10**`,
    image: { url: mediaUrl },
    footer: { text: '21+ | Gambling involves risk. No guaranteed results.' },
    timestamp: new Date().toISOString()
  };

  if (sourceUrl) {
    embed.fields = [{ name: 'Research source', value: sourceUrl }];
  }

  return embed;
}

module.exports = { buildPickEmbed, listFromEnv, makeEvidence, validatePick };
