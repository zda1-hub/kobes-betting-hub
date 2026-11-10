const sharp = require('sharp');
const { escapeXml } = require('./instagram-story');
const { auditedFetch } = require('../../pipeline/api-client');

const WIDTH = 1080;
const HEIGHT = 1920;
const DISCORD = 'discord.gg/sB9vzGz2xj';

function linesFor(copy, limit) {
  return String(copy).split(/\r?\n/).flatMap(paragraph => {
    if (!paragraph.trim()) return [''];
    const words = paragraph.trim().split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > limit) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  });
}

function resultStorySvg(copy) {
  const approved = String(copy || '').trim();
  const match = /^FREE PICK RESULT: (WIN|LOSS|PUSH|VOID)(?:\n|$)/m.exec(approved);
  if (!match || !approved.includes('Final: ') || approved.length > 280)
    throw new Error('Result Story requires the exact approved grade, wager and final.');
  const grade = match[1];
  const color = { WIN: '#3fe093', LOSS: '#ff7770', PUSH: '#f3c75b', VOID: '#aab7c7' }[grade];
  const content = approved.replace(/^FREE PICK RESULT: (?:WIN|LOSS|PUSH|VOID)\s*/m, '').trim();
  let font = 52, rows;
  for (; font >= 34; font -= 2) {
    rows = linesFor(content, Math.floor(830 / (font * 0.56)));
    if (rows.length * font * 1.35 <= 715) break;
  }
  if (font < 34) throw new Error('Approved result is too long for a complete Story card.');
  const lineHeight = Math.round(font * 1.35);
  const bodyStart = 680 + Math.max(0, Math.round((715 - rows.length * lineHeight) / 2));
  const body = rows.map((line, index) => line
    ? `<text x="115" y="${bodyStart + index * lineHeight}">${escapeXml(line)}</text>` : '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="1080" height="1920" fill="#090909"/>
    <rect width="1080" height="28" fill="#ff7900"/>
    <text x="90" y="170" font-family="Arial,Helvetica,sans-serif" font-size="66" font-weight="900" fill="#f4f0e8">KOBE'S</text>
    <text x="90" y="248" font-family="Arial,Helvetica,sans-serif" font-size="66" font-weight="900" fill="#ff7900">BETTING HUB</text>
    <line x1="90" y1="310" x2="990" y2="310" stroke="#ff7900" stroke-width="7"/>
    <text x="90" y="425" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="800" letter-spacing="5" fill="#ff7900">FREE PICK RESULT</text>
    <rect x="90" y="475" width="900" height="154" rx="28" fill="#171b1b" stroke="${color}" stroke-width="4"/>
    <text x="540" y="580" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="90" font-weight="900" fill="${color}">${grade}</text>
    <g font-family="Arial,Helvetica,sans-serif" font-size="${font}" font-weight="700" fill="#f4f0e8">${body}</g>
    <rect x="90" y="1510" width="900" height="190" rx="24" fill="#f4f0e8"/>
    <text x="540" y="1585" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="800" letter-spacing="3" fill="#5b5852">JOIN THE FREE DISCORD</text>
    <text x="540" y="1665" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="900" fill="#090909">${DISCORD}</text>
    <text x="90" y="1810" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700" fill="#aaa49b">RESULTS VARY · 21+ WHERE PERMITTED</text>
  </svg>`;
}

async function renderResultStory(copy) {
  return sharp(Buffer.from(resultStorySvg(copy))).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}

async function queueApprovedResultStory({ row, copy, approvedBy, resultDigest, environment = process.env,
  fetchImpl = fetch, render = renderResultStory }) {
  const secret = environment.FREE_PICK_SITE_PUBLISH_SECRET;
  if (!secret) throw new Error('Instagram result queue is not configured.');
  const origin = (environment.FREE_PICK_SITE_PUBLISH_URL || 'https://bettinghub-publisher.kobedirwin.workers.dev').replace(/\/$/, '');
  const form = new FormData();
  for (const [key, value] of Object.entries({ pickId: row.pick_id, resultDigest, approvedBy,
    verifiedAt: row.result_verified_at, source: row.result_verified_source, copy })) form.set(key, value);
  form.set('image', new Blob([await render(copy)], { type: 'image/jpeg' }), `KBH-${row.pick_id}-result.jpg`);
  const response = await auditedFetch(`${origin}/api/free-pick/result-story`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: form,
  }, { service: 'cloudflare-worker', endpointClass: '/api/free-pick/result-story',
    callerComponent: 'bot/lib/free-pick-result-story', triggerType: 'approved_result_story', pickId: row.pick_id }, fetchImpl);
  const receipt = await response.json().catch(() => ({}));
  if (![200, 201].includes(response.status) || !['approved', 'already_queued', 'published'].includes(receipt.status)
    || receipt.state === 'held')
    throw new Error(`Instagram result queue needs attention (${response.status}).`);
  return receipt;
}

module.exports = { resultStorySvg, renderResultStory, queueApprovedResultStory };
