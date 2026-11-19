const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { milestones } = require('../content/truck_config.json');
const { dayNumber, FALLBACK_RECORD } = require('./road-to-truck-schedule');

const ROOT = path.join(__dirname, '..');
const WIDTH = 1080;
const HEIGHT = 1350;
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function renderCard({ date, record = FALLBACK_RECORD, photoPath = path.join(ROOT, 'assets/road_to_truck/cybertruck.jpg'),
  outputPath = null, milestoneItems = milestones } = {}) {
  const day = dayNumber(date);
  if (!Number.isInteger(day) || day < 1) throw new Error('Truck card date must be Nov 19, 2026 or later.');
  if (!/^\d+-\d+$/.test(record)) throw new Error('Card record must be a verified W-L value.');
  if (!Array.isArray(milestoneItems) || milestoneItems.length < 2 || milestoneItems.length > 5 ||
      milestoneItems.some(item => !item.label || typeof item.done !== 'boolean')) throw new Error('Invalid milestone config.');
  let background = sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: '#0b0c0f' } }).png();
  let hasPhoto = false;
  try {
    const photo = await fs.readFile(photoPath);
    background = sharp(photo).resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' }).png();
    hasPhoto = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const [font, logo] = await Promise.all([
    fs.readFile(path.join(ROOT, 'assets/road_to_truck/Inter.ttf')),
    fs.readFile(path.join(ROOT, 'assets/kobes-betting-hub-logo-20261005.png')),
  ]);
  const fontUrl = `data:font/ttf;base64,${font.toString('base64')}`;
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`;
  const x0 = 142, x1 = 938;
  const point = index => x0 + (x1 - x0) * index / (milestoneItems.length - 1);
  const progress = milestoneItems.findLastIndex(item => item.done);
  const progressEnd = progress < 0 ? x0 : point(progress);
  const marks = milestoneItems.map((item, index) => {
    const x = point(index);
    return `<circle cx="${x}" cy="916" r="18" fill="${item.done ? '#ff7a1a' : '#4d5667'}" stroke="#0b0c0f" stroke-width="6"/>
      <text x="${x}" y="975" text-anchor="middle" class="milestone" fill="${item.done ? '#fff' : '#aab2bf'}">${esc(item.label)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0c0f" stop-opacity=".74"/><stop offset=".42" stop-color="#0b0c0f" stop-opacity=".52"/><stop offset="1" stop-color="#0b0c0f" stop-opacity=".96"/></linearGradient>
    <linearGradient id="progress" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff7a1a"/><stop offset="1" stop-color="#4da3ff"/></linearGradient>
    <style>@font-face{font-family:Inter;src:url('${fontUrl}') format('truetype')}text{font-family:Inter,sans-serif}.kicker{font-size:47px;font-weight:800;letter-spacing:4px}.day{font-size:188px;font-weight:900;letter-spacing:-8px}.record{font-size:45px;font-weight:700}.small{font-size:32px;font-weight:600}.milestone{font-size:25px;font-weight:700}.footer{font-size:29px;font-weight:700}.photo-credit{font-size:21px;font-weight:500}</style></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
    <rect x="58" y="58" width="964" height="1234" rx="38" fill="#16181d" fill-opacity=".40" stroke="#ffffff" stroke-opacity=".17" stroke-width="2"/>
    <image href="${logoUrl}" x="92" y="92" width="126" height="126" preserveAspectRatio="xMidYMid meet"/>
    <rect x="242" y="126" width="10" height="57" rx="5" fill="#ff7a1a"/>
    <text x="280" y="171" class="kicker" fill="#ffffff">ROAD TO THE TRUCK</text>
    <rect x="94" y="285" width="892" height="354" rx="42" fill="#0b0c0f" fill-opacity=".73" stroke="#ff7a1a" stroke-opacity=".65" stroke-width="3"/>
    <text x="540" y="510" text-anchor="middle" class="day" fill="#ffffff">DAY ${day}</text>
    <rect x="94" y="690" width="892" height="127" rx="28" fill="#16181d" fill-opacity=".91"/>
    <text x="540" y="766" text-anchor="middle" class="record" fill="#ffffff">${esc(record)} free picks since sep 22</text>
    <text x="540" y="809" text-anchor="middle" class="small" fill="#3dcc7a">every loss posted</text>
    <rect x="${x0}" y="906" width="${x1 - x0}" height="20" rx="10" fill="#4d5667"/>
    <rect x="${x0}" y="906" width="${Math.max(0, progressEnd - x0)}" height="20" rx="10" fill="url(#progress)"/>
    ${marks}
    <text x="540" y="1072" text-anchor="middle" class="small" fill="#4da3ff">elon says production ends mid 2027</text>
    <line x1="112" x2="968" y1="1161" y2="1161" stroke="#ffffff" stroke-opacity=".25"/>
    <text x="540" y="1221" text-anchor="middle" class="footer" fill="#ffffff">21+ | not a guarantee</text>
    ${hasPhoto ? '<text x="540" y="1270" text-anchor="middle" class="photo-credit" fill="#d8dde5">photo: Mr.choppers / CC BY-SA 3.0</text>' : ''}
  </svg>`;
  const base = await background.toBuffer();
  const output = await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  if (outputPath) { await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, output); }
  return { png: output, day, date, hasPhoto, width: WIDTH, height: HEIGHT, outputPath };
}

module.exports = { renderCard, WIDTH, HEIGHT };
