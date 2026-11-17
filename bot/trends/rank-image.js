'use strict';

const sharp = require('sharp');

const esc = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
function rankImage({ sport, section, metric, rows, updatedAt, dataDate,
  totalTeams = sport === 'NBA' ? 30 : 32, page = 1, pages = 1 }) {
  if (!['NBA', 'NFL'].includes(sport) || !['Offense', 'Defense', 'Vs position'].includes(section) ||
      !metric || !Array.isArray(rows) || !updatedAt) throw new Error('Complete rank sheet required');
  const width = 1080;
  const height = Math.max(730, 290 + rows.length * 62 + 160);
  const parts = rows.map((row, index) => {
    const y = 310 + index * 62;
    const rank = Number.isInteger(row.rank) ? `#${row.rank}` : 'N/A';
    const average = Number.isFinite(row.average) ? row.average.toFixed(1) : 'N/A';
    const tier = row.rank && row.rank <= Math.ceil(totalTeams / 3) ? 'Favors overs' :
      row.rank && row.rank > Math.floor(totalTeams * 2 / 3) ? 'Tougher' : 'Middle';
    const color = tier === 'Favors overs' ? '#6ee7a0' :
      tier === 'Tougher' ? '#ff8080' : '#d1d5db';
    return `<rect x="52" y="${y - 42}" width="976" height="57" rx="8" fill="${index % 2 ? '#161b24' : '#11151c'}"/>` +
      `<text x="76" y="${y - 5}" font-size="38" font-weight="700" fill="#fff">${esc(row.team)}</text>` +
      `<text x="356" y="${y - 5}" font-size="34" fill="#e5e7eb">${esc(average)} avg</text>` +
      `<text x="635" y="${y - 5}" font-size="36" font-weight="700" fill="${color}">${esc(rank)}</text>` +
      `<text x="770" y="${y - 5}" font-size="29" fill="${color}">${esc(tier)}</text>`;
  }).join('');
  const footerY = height - 86;
  const direction = section === 'Offense' ? 'Higher output favors team overs' :
    section === 'Defense' && /^(Sacks|INT|Turnovers forced)$/i.test(metric) ?
      'Higher favors defense stat overs' : 'More allowed favors opponent overs';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="1080" height="${height}" fill="#090b10"/>
  <rect x="0" y="0" width="1080" height="14" fill="#ff7a1a"/>
  <text x="52" y="85" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#ff7a1a">KOBE'S BETTING HUB · TEAM RANKS</text>
  <text x="52" y="145" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#fff">${esc(sport)} ${esc(section)} · ${esc(metric)}</text>
  <text x="52" y="200" font-family="Arial, sans-serif" font-size="25" fill="#cbd5e1">Updated ${esc(updatedAt)} | Updated every Tuesday at 10 AM PT</text>
  <text x="52" y="240" font-family="Arial, sans-serif" font-size="24" fill="#cbd5e1">Through ${esc(dataDate || 'N/A')} · ${esc(direction)} · ${page}/${pages}</text>
  <g font-family="Arial, sans-serif">${parts}</g>
  <text x="52" y="${footerY}" font-family="Arial, sans-serif" font-size="23" fill="#cbd5e1">${sport === 'NFL' ? 'Data: nflverse (CC BY 4.0) · ' : ''}Research only, not a guarantee</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function rankImages(options) {
  const chunks = [];
  const pages = Math.max(1, Math.ceil(options.rows.length / 16));
  for (let index = 0; index < pages; index++) chunks.push(await rankImage({ ...options,
    rows: options.rows.slice(index * 16, index * 16 + 16),
    totalTeams: options.rows.length, page: index + 1, pages }));
  return chunks;
}

module.exports = { rankImage, rankImages };
