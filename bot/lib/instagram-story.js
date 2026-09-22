const sharp = require('sharp');
const { publicPickTerms, sourceEvidence } = require('./source-review');

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapWords(value, maxCharacters = 29) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 8);
}

function storyTerms(packet) {
  const terms = publicPickTerms(packet);
  if (!terms.length) throw new Error('The approved free pick has no terms for the Instagram Story.');
  return terms;
}

function storySvg(packet) {
  const terms = storyTerms(packet);
  const evidence = sourceEvidence(packet).filter((claim) => claim.length <= 105).slice(0, 2);
  const titleLines = wrapWords(terms[0], 24);
  const detailLines = terms.slice(1).flatMap((term) => wrapWords(term, 34)).slice(0, 7);
  const title = titleLines.map((line, index) => (
    `<text x="90" y="${610 + (index * 92)}" class="pick">${escapeXml(line)}</text>`
  )).join('');
  const detailStart = 610 + (titleLines.length * 92) + 42;
  const details = detailLines.map((line, index) => (
    `<text x="94" y="${detailStart + (index * 60)}" class="detail">${escapeXml(line)}</text>`
  )).join('');
  const breakdown = evidence.flatMap((claim, index) => wrapWords(claim, 43).slice(0, 3)
    .map((line, lineIndex) => `<text x="118" y="${1160 + (index * 150) + (lineIndex * 48)}" class="reason">${escapeXml(line)}</text>`)).join('');

  return `
    <svg width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1920" fill="#090909"/>
      <rect x="0" y="0" width="1080" height="30" fill="#ff6a00"/>
      <circle cx="930" cy="190" r="230" fill="#ff6a00" opacity="0.14"/>
      <circle cx="140" cy="1710" r="270" fill="#ff6a00" opacity="0.10"/>
      <text x="90" y="170" class="brand">KOBE&apos;S</text>
      <text x="90" y="250" class="brand accent">BETTING HUB</text>
      <line x1="90" y1="312" x2="990" y2="312" stroke="#ff6a00" stroke-width="8"/>
      <text x="90" y="445" class="eyebrow">TODAY&apos;S FREE PLAY</text>
      ${title}
      ${details}
      ${evidence.length ? `<rect x="90" y="1040" width="900" height="395" rx="24" fill="#1c1c1c" stroke="#ff6a00" stroke-width="3"/><text x="118" y="1110" class="breakdownTitle">THE QUICK BREAKDOWN</text>${breakdown}` : ''}
      <rect x="90" y="1510" width="900" height="190" rx="24" fill="#f4f0e8"/>
      <text x="540" y="1585" text-anchor="middle" class="ctaTop">FULL WRITEUP + MEMBER CARD</text>
      <text x="540" y="1665" text-anchor="middle" class="cta">KOBESBETTINGHUB.COM</text>
      <text x="90" y="1810" class="legal">LEGAL AGE WHERE YOU LIVE • WAGER RESPONSIBLY</text>
      <style>
        .brand { fill:#f4f0e8; font-family:Arial,Helvetica,sans-serif; font-size:72px; font-weight:900; letter-spacing:4px; }
        .accent { fill:#ff6a00; }
        .eyebrow { fill:#ff6a00; font-family:Arial,Helvetica,sans-serif; font-size:39px; font-weight:800; letter-spacing:8px; }
        .pick { fill:#f4f0e8; font-family:Arial,Helvetica,sans-serif; font-size:78px; font-weight:900; letter-spacing:-2px; }
        .detail { fill:#d9d4cb; font-family:Arial,Helvetica,sans-serif; font-size:38px; font-weight:600; }
        .breakdownTitle { fill:#ff6a00; font-family:Arial,Helvetica,sans-serif; font-size:31px; font-weight:800; letter-spacing:3px; }
        .reason { fill:#f4f0e8; font-family:Arial,Helvetica,sans-serif; font-size:31px; font-weight:600; }
        .ctaTop { fill:#5b5852; font-family:Arial,Helvetica,sans-serif; font-size:25px; font-weight:800; letter-spacing:3px; }
        .cta { fill:#090909; font-family:Arial,Helvetica,sans-serif; font-size:48px; font-weight:900; letter-spacing:1px; }
        .legal { fill:#a8a39b; font-family:Arial,Helvetica,sans-serif; font-size:24px; font-weight:700; letter-spacing:2px; }
      </style>
    </svg>`;
}

async function renderInstagramStory(packet, { sharpImpl = sharp } = {}) {
  return sharpImpl(Buffer.from(storySvg(packet)))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

function instagramStoryFilename(pickId) {
  const safeId = String(pickId || 'free-pick').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  return `kobes-betting-hub-${safeId}-story.jpg`;
}

module.exports = {
  STORY_HEIGHT,
  STORY_WIDTH,
  escapeXml,
  instagramStoryFilename,
  renderInstagramStory,
  storySvg,
  wrapWords,
};
