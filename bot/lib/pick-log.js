const fs = require('node:fs/promises');
const path = require('node:path');

const PICK_LOG_HEADERS = [
  'pick_id', 'operating_date', 'event', 'sport', 'league', 'event_start', 'event_timezone',
  'market', 'selection', 'published_line', 'published_odds_american', 'units_risked',
  'source_name', 'credit_text', 'approver', 'approved_at', 'published_by', 'published_at',
  'destination', 'post_reference', 'status', 'result', 'score_or_outcome',
  'result_verified_source', 'result_verified_at', 'graded_by', 'net_units',
  'correction_reference', 'notes'
];

const DEFAULT_PICK_LOG_PATH = path.join(__dirname, '..', '..', 'trackers', 'pick-log.csv');

function pickLogPath() {
  return process.env.PICK_LOG_PATH || DEFAULT_PICK_LOG_PATH;
}

function csvCell(value = '') {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

async function readPickLog(logPath = pickLogPath()) {
  let content;
  try {
    content = await fs.readFile(logPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const [headerRow, ...records] = parseCsv(content);
  if (!headerRow) return [];
  if (headerRow.join(',') !== PICK_LOG_HEADERS.join(',')) {
    throw new Error('pick-log.csv has an unexpected header. Restore the canonical header before publishing.');
  }
  return records.map((record) => Object.fromEntries(PICK_LOG_HEADERS.map((header, index) => [header, record[index] || ''])));
}

async function writePickLog(rows, logPath = pickLogPath()) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const csv = [PICK_LOG_HEADERS.join(','), ...rows.map((row) => PICK_LOG_HEADERS.map((header) => csvCell(row[header])).join(','))].join('\n');
  await fs.writeFile(logPath, `${csv}\n`);
}

async function appendOfficialPick(entry, logPath = pickLogPath()) {
  if (!entry.pick_id || !entry.operating_date || !entry.published_at || !entry.destination) {
    throw new Error('Official pick logging requires a Pick ID, operating date, publication time, and destination.');
  }
  const rows = await readPickLog(logPath);
  if (rows.some((row) => row.pick_id === entry.pick_id)) {
    throw new Error(`Pick ID ${entry.pick_id} already exists in pick-log.csv.`);
  }
  const row = Object.fromEntries(PICK_LOG_HEADERS.map((header) => [header, entry[header] ?? '']));
  await writePickLog([...rows, row], logPath);
  return row;
}

async function updateOfficialPick(pickId, patch, logPath = pickLogPath()) {
  const rows = await readPickLog(logPath);
  const index = rows.findIndex((row) => row.pick_id === pickId);
  if (index === -1) throw new Error(`Pick ID ${pickId} was not found in pick-log.csv.`);
  rows[index] = { ...rows[index], ...patch };
  await writePickLog(rows, logPath);
  return rows[index];
}

function numeric(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.+-]/g, '');
  if (!cleaned || cleaned === '+' || cleaned === '-' || cleaned === '.') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function resultFor(row) {
  const value = String(row.result || row.status || 'PENDING').trim().toUpperCase();
  return ['W', 'L', 'P', 'V', 'PENDING'].includes(value) ? value : 'PENDING';
}

function netUnitsFor(row) {
  const saved = numeric(row.net_units);
  if (saved !== null) return saved;
  const units = numeric(row.units_risked);
  const odds = numeric(row.published_odds_american);
  const result = resultFor(row);
  if (units === null) return null;
  if (result === 'L') return -units;
  if (result === 'P' || result === 'V') return 0;
  if (result !== 'W' || odds === null || odds === 0) return null;
  return odds > 0 ? units * odds / 100 : units * 100 / Math.abs(odds);
}

function pacificOperatingDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function makePickId({ date = pacificOperatingDate(), sport, pickNumber }) {
  const sportCode = String(sport || 'other').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const number = String(pickNumber).padStart(3, '0');
  return `${date.replaceAll('-', '')}-${sportCode}-${number}`;
}

module.exports = {
  DEFAULT_PICK_LOG_PATH,
  PICK_LOG_HEADERS,
  appendOfficialPick,
  makePickId,
  netUnitsFor,
  pacificOperatingDate,
  pickLogPath,
  readPickLog,
  resultFor,
  updateOfficialPick
};
