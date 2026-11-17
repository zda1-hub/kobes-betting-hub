'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const bdl = require('./bdl-nba');
const { snapshot: nflSnapshot } = require('./nfl-search');
const { seasonFor } = require('./nfl-auto');
const { serviceDate } = require('./bulk-panel');
const { computeNba, computeNfl } = require('./team-ranks');
const DEFINITION_VERSION = 2;

function previousSunday(now = new Date()) {
  const date = new Date(`${serviceDate(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}
function sheetPath(root, sport, date) {
  return path.join(root, 'trends', 'team-ranks', `${sport.toLowerCase()}-${date}.json`);
}
async function save(root, sport, date, sheet) {
  const target = sheetPath(root, sport, date);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(sheet), { mode: 0o600 });
  await fs.rename(temp, target);
}
async function load(root, sport, date) {
  try { return JSON.parse(await fs.readFile(sheetPath(root, sport, date), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function currentSnapshot(sheet, now = new Date()) {
  return sheet?.definitionVersion === DEFINITION_VERSION &&
    sheet.updatedAt && serviceDate(new Date(sheet.updatedAt)) === serviceDate(now);
}
async function nbaRows({ apiKey, season, endDate, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('NBA rank refresh needs the existing BALLDONTLIE key');
  const rows = [];
  let cursor;
  for (let page = 0; page < 200; page++) {
    const params = new URLSearchParams({ per_page: '100', season_type: 'regular',
      end_date: endDate });
    params.append('seasons[]', String(season));
    if (cursor !== undefined) params.set('cursor', String(cursor));
    const body = await bdl.request(`/v1/stats?${params}`, { apiKey, fetchImpl });
    rows.push(...body.data);
    const next = body.meta.next_cursor;
    if (next === undefined || next === null) return rows;
    if (String(next) === String(cursor)) throw new Error('NBA rank cursor did not advance');
    cursor = next;
  }
  throw new Error('NBA rank season exceeded bounded pagination');
}
async function refresh({ root, sport, bdlKey, now = new Date(), fetchImpl = fetch }) {
  const date = previousSunday(now);
  const existing = await load(root, sport, date);
  if (currentSnapshot(existing, now)) return { sheet: existing, existing: true };
  let sheet;
  if (sport === 'NBA') {
    const season = bdl.seasonStart(now);
    const rows = await nbaRows({ apiKey: bdlKey, season, endDate: date, fetchImpl });
    if (!rows.length) throw new Error('No completed NBA regular-season rows for team ranks');
    sheet = computeNba(rows, { season, endDate: date });
  } else if (sport === 'NFL') {
    const season = seasonFor(now);
    const data = await nflSnapshot({ season, fetchImpl, now: now.valueOf() });
    sheet = computeNfl(data.statsCsv, data.scheduleCsv, { season, endDate: date });
  } else throw new Error('Unsupported team rank sport');
  if (!sheet.dataDate) throw new Error('No completed games for team ranks');
  if (sheet.offense.points?.length !== 32 && sport === 'NFL')
    throw new Error('NFL rank table does not cover all 32 teams');
  if (sheet.offense.pts?.length !== 30 && sport === 'NBA')
    throw new Error('NBA rank table does not cover all 30 teams');
  sheet.updatedAt = now.toISOString();
  sheet.definitionVersion = DEFINITION_VERSION;
  await save(root, sport, date, sheet);
  return { sheet, existing: false };
}

module.exports = { DEFINITION_VERSION, previousSunday, sheetPath, load,
  currentSnapshot, nbaRows, refresh };
