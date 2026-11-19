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
    <text x="540" y="1072" text-anchor="middle" class="small" fill="#4da3ff">elon says production ends summer 2027</text>
    <line x1="112" x2="968" y1="1161" y2="1161" stroke="#ffffff" stroke-opacity=".25"/>
    <text x="540" y="1221" text-anchor="middle" class="footer" fill="#ffffff">21+ | not a guarantee</text>
    ${hasPhoto ? '<text x="540" y="1270" text-anchor="middle" class="photo-credit" fill="#d8dde5">photo: Mr.choppers / CC BY-SA 3.0</text>' : ''}
  </svg>`;
  const base = await background.toBuffer();
  const output = await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  if (outputPath) { await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, output); }
  return { png: output, day, date, hasPhoto, width: WIDTH, height: HEIGHT, outputPath };
}

async function renderDailyCard({ day, spot, newNames = [], topRef = null,
  photoPath = path.join(ROOT, 'assets/road_to_truck/cybertruck.jpg'), outputPath = null } = {}) {
  if (!Number.isInteger(day) || day < 1 || !Number.isInteger(spot) || spot < 0) throw new Error('Verified day and spot are required.');
  const photo = await fs.readFile(photoPath); // A missing photo must hold the post.
  const [font, logo] = await Promise.all([
    fs.readFile(path.join(ROOT, 'assets/road_to_truck/Inter.ttf')),
    fs.readFile(path.join(ROOT, 'assets/kobes-betting-hub-logo-20261005.png')),
  ]);
  const fontUrl = `data:font/ttf;base64,${font.toString('base64')}`;
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`;
  const names = newNames.slice(0, 3).map(name => String(name).slice(0, 20));
  while (names.length > 1 && names.join('  •  ').length > 50) names.pop();
  const wallLine = names.length ? `new on the wall: ${names.join('  •  ')}`
    : spot === 0 ? "who's first on the wall?" : "who's next on the wall?";
  const safeTop = topRef ? String(topRef).slice(0, 20) : 'none yet';
  const percent = Math.min(100, spot / 200 * 100);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0c0f" stop-opacity=".65"/><stop offset=".48" stop-color="#0b0c0f" stop-opacity=".08"/><stop offset="1" stop-color="#0b0c0f" stop-opacity="1"/></linearGradient>
    <style>@font-face{font-family:Inter;src:url('${fontUrl}') format('truetype')}text{font-family:Inter,sans-serif}</style></defs>
    <rect width="1080" height="1350" fill="url(#fade)"/>
    <image href="${logoUrl}" x="70" y="70" width="115" height="115"/>
    <text x="210" y="115" fill="#fff" font-size="44" font-weight="800">ROAD TO THE CYBERTRUCK</text>
    <text x="210" y="160" fill="#cbd2dc" font-size="24">building it in public</text>
    <rect x="48" y="760" width="984" height="500" rx="28" fill="#16181d"/>
    <text x="80" y="855" fill="#ff7a1a" font-size="48" font-weight="800">DAY ${day} • ROAD TO THE CYBERTRUCK</text>
    <text x="80" y="955" fill="#fff" font-size="77" font-weight="900">SPOT ${spot} OF 200</text>
    <rect x="80" y="1000" width="920" height="28" rx="14" fill="#3d4551"/>
    <rect x="80" y="1000" width="${Math.max(0, 920 * percent / 100)}" height="28" rx="14" fill="#ff7a1a"/>
    <text x="80" y="1080" fill="#fff" font-size="25" font-weight="700">${esc(wallLine)}</text>
    <text x="80" y="1130" fill="#4da3ff" font-size="29" font-weight="700">this week's top referrer: ${esc(safeTop)}</text>
    <text x="540" y="1210" text-anchor="middle" fill="#fff" font-size="26" font-weight="700">21+ | not a guarantee</text>
    <text x="540" y="1245" text-anchor="middle" fill="#b5bcc7" font-size="19">Photo: Mr.choppers, CC BY-SA 3.0, Wikimedia Commons</text>
  </svg>`;
  const photoBand = await sharp(photo).resize(WIDTH, 760, { fit: 'cover', position: 'centre' }).png().toBuffer();
  const background = await sharp({create:{width:WIDTH,height:HEIGHT,channels:4,background:'#0b0c0f'}})
    .composite([{input:photoBand,top:0,left:0}]).png().toBuffer();
  const png = await sharp(background).composite([{input:Buffer.from(svg)}]).png().toBuffer();
  if (outputPath) { await fs.mkdir(path.dirname(outputPath), {recursive:true}); await fs.writeFile(outputPath,png); }
  return {png,day,spot,width:WIDTH,height:HEIGHT,outputPath};
}

module.exports = { renderCard, renderDailyCard, WIDTH, HEIGHT };
