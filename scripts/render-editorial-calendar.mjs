import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const drafts = JSON.parse(await fs.readFile(path.join(root, 'drafts/calendar/editorial-drafts.json'), 'utf8'));
const logo = (await fs.readFile(path.join(root, 'assets/kobes-betting-hub-logo-20261005.png'))).toString('base64');
const out = path.join(root, 'drafts/calendar/editorial-assets');
await fs.mkdir(out, { recursive: true });

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const line = (value, x, y, size, color = '#ffffff', weight = 700) =>
  `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;
const fit = (value, normal, long, limit) => value.length > limit ? long : normal;

for (const draft of drafts) {
  if (!draft.xText.includes('https://discord.gg/sB9vzGz2xj') || draft.xText.length > 260)
    throw new Error(`Draft ${draft.id} needs a short direct-Discord X caption`);
  const title = draft.title.map((value, i) => line(value, 72, 425 + i * 102,
    fit(value, 78, 62, 17), i ? '#ff7a1a' : '#ffffff', 900)).join('');
  const body = draft.body.map((value, i) => line(value, 96, 980 + i * 70,
    fit(value, 46, 39, 36), '#e8edf5', 500)).join('');
  const action = draft.manualOnly
    ? `<rect x="72" y="1215" width="936" height="240" rx="30" fill="#152234" stroke="#36506c" stroke-width="2"/>${line('PICK A SIDE IN THE POLL', 105, 1280, 35, '#ff8a32', 800)}`
    : `${line('THE NEXT CHECK', 72, 1225, 34, '#ff8a32', 800)}${draft.action.map((value, i) => line(value, 96, 1290 + i * 69, fit(value, 46, 40, 36), '#e8edf5', 500)).join('')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#08111f"/><stop offset="0.65" stop-color="#05080e"/><stop offset="1" stop-color="#15100d"/></linearGradient><linearGradient id="rule" x1="0" x2="1"><stop stop-color="#2678f8"/><stop offset="1" stop-color="#ff7a1a"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="1050" cy="1450" r="480" fill="#ff7a1a" opacity="0.045"/><circle cx="-100" cy="350" r="360" fill="#2678f8" opacity="0.07"/>
    <image x="72" y="80" width="146" height="146" href="data:image/png;base64,${logo}"/>
    ${line("KOBE'S BETTING HUB", 250, 155, 45, '#ffffff', 800)}
    ${line(draft.kicker, 250, 204, fit(draft.kicker, 27, 23, 31), '#65a8ff', 800)}
    <rect x="72" y="260" width="936" height="6" rx="3" fill="url(#rule)"/>
    ${title}
    <rect x="72" y="614" width="936" height="546" rx="30" fill="#131a27" stroke="#294565" stroke-width="2"/>
    <rect x="72" y="614" width="936" height="12" rx="6" fill="#287ef6"/>
    ${line(draft.figure, 96, 790, fit(draft.figure, 80, 62, 15), '#68a9ff', 900)}
    ${line(draft.figureNote, 96, 850, fit(draft.figureNote, 34, 30, 34), '#aeb9c9', 500)}
    <rect x="96" y="891" width="888" height="2" fill="#34506d"/>
    ${body}
    ${action}
    <rect x="72" y="1500" width="936" height="184" rx="30" fill="#f4f1eb"/>
    ${line('JOIN THE FREE DISCORD', 107, 1575, 32, '#596577', 800)}
    ${line('discord.gg/sB9vzGz2xj', 107, 1633, 54, '#0b1424', 800)}
    <rect x="72" y="1735" width="936" height="2" fill="url(#rule)"/>
    ${line('21+ where permitted  •  No guarantees', 72, 1805, 31, '#97a5b8', 500)}
    ${line(draft.manualOnly ? 'Discussion  •  Not a pick' : 'No specific pick or betting edge claimed', 72, 1857, 27, '#77879b', 500)}
  </svg>`;
  const target = path.join(out, `${draft.id}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toFile(target);
  const meta = await sharp(target).metadata();
  const size = (await fs.stat(target)).size;
  if (meta.width !== 1080 || meta.height !== 1920 || size > 5 * 1024 * 1024) throw new Error(`Bad output: ${target}`);
  console.log(`${draft.id}: ${target} (${size} bytes)`);
}
