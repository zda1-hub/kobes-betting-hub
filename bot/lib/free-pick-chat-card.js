const sharp = require('sharp');
const { escapeXml } = require('./instagram-story');
const { assertFreePickEligible, publicPickTerms, sourceEvidence } = require('./source-review');
const WIDTH = 1080, HEIGHT = 1350;
function wrap(text, limit) {
  const lines = []; let line = '';
  for (const word of String(text).trim().split(/\s+/)) {
    if ((line + ' ' + word).trim().length > limit && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line); return lines;
}
function chatCardCopy(packet) {
  assertFreePickEligible(packet);
  const terms = publicPickTerms(packet);
  if (terms.length !== 1) throw new Error('Chat graphic needs one approved Free Pick; do not omit parlay legs.');
  const evidence = sourceEvidence(packet).filter(Boolean);
  if (!evidence.length) throw new Error('Chat graphic needs an approved breakdown.');
  return { hook: "Baby, what's today's free pick?", reply: "Of course, babe. Here's the play.", term: terms[0], evidence: evidence.slice(0, 3) };
}
function chatCardSvg(packet) {
  const copy = chatCardCopy(packet);
  // All rows are laid out together; reduce type to fit long approved facts,
  // never truncate a wager or cut a statistical claim halfway through.
  let size = 46, rows;
  for (; size >= 30; size -= 2) {
    const chars = Math.floor(770 / (size * .54));
    rows = [
      ...wrap(copy.reply, chars).map(text => ({text, weight:400})), {gap:34},
      ...wrap(copy.term, Math.floor(chars * .92)).map(text => ({text,weight:700})), {gap:34},
      ...copy.evidence.flatMap(text => [...wrap('• ' + text, chars).map(text => ({text,weight:400})), {gap:22}])
    ];
    if (rows.reduce((sum,r) => sum+(r.gap || size*1.24),0) <= 862) break;
  }
  if (size < 30) throw new Error('Approved breakdown is too long for the chat card; needs editorial review.');
  let y = 360;
  const text = rows.map(row => { if(row.gap) { y += row.gap; return ''; }
    const out = `<text x="202" y="${y}" font-size="${size}" font-weight="${row.weight}">${escapeXml(row.text)}</text>`;
    y += size*1.24; return out; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs><linearGradient id="blue" x2="0" y2="1"><stop stop-color="#32a1f1"/><stop offset="1" stop-color="#087ff2"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="#f6f6f7"/>
  <rect x="40" y="40" width="846" height="204" rx="62" fill="#e2e2e6"/>
  <path d="M70 190 Q75 240 46 264 Q95 249 113 226" fill="#e2e2e6"/>
  <g font-family="Arial, Helvetica, sans-serif" fill="#111"><text x="82" y="113" font-size="48">Baby, what's today's</text><text x="82" y="179" font-size="48">free pick?</text></g>
  <path d="M366 150 C352 128 322 139 327 158 C330 170 348 183 366 195 C384 183 403 170 405 158 C410 139 380 128 366 150" fill="#ef4444"/>
  <rect x="158" y="280" width="880" height="${Math.max(880, y-280+28)}" rx="65" fill="url(#blue)"/>
  <path d="M1005 ${y-6} Q1005 ${y+46} 1050 ${y+64} Q1000 ${y+51} 980 ${y+25}" fill="#087ff2"/>
  <g font-family="Arial, Helvetica, sans-serif" fill="white">${text}</g>
  <text x="540" y="1272" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="23" fill="#555">KOBE'S BETTING HUB · FREE PICK</text>
  <text x="540" y="1310" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" fill="#777">21+ where permitted. Wager responsibly.</text>
  </svg>`;
}
async function renderFreePickChatCard(packet) { return sharp(Buffer.from(chatCardSvg(packet))).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer(); }
module.exports = { WIDTH, HEIGHT, chatCardCopy, chatCardSvg, renderFreePickChatCard };
