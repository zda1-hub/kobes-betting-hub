'use strict';

// A quota-free, read-only midnight inventory. This deliberately does not
// turn a listed game or a member request into a verified current prop.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { events } = require('./odds-api');
const { popularCombos } = require('./combo-ledger');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');

const SPORTS = ['NBA', 'NFL', 'MLB', 'NHL'];
const inFlight = new Map();

function eligibleEvents(rows, serviceDate, now) {
  if (!Array.isArray(rows)) throw new Error('Odds provider returned an invalid event list');
  return rows.filter(row => typeof row.id === 'string' &&
    typeof row.home_team === 'string' && typeof row.away_team === 'string' &&
    Number.isFinite(Date.parse(row.commence_time)) &&
    Date.parse(row.commence_time) > now.valueOf() &&
    belongsToServiceDate(row.commence_time, serviceDate))
    .map(row => ({ id: row.id, homeTeam: row.home_team, awayTeam: row.away_team,
      startsAt: row.commence_time }));
}

function scanPath(root, serviceDate) {
  if (!root || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate || '')) throw new Error('Invalid Trends scan path');
  return path.join(root, 'trends-daily', `${serviceDate}.json`);
}

async function scanDaily({ root, apiKey, now = new Date(), fetchImpl = fetch,
  readEvents = events, readPopularCombos = popularCombos } = {}) {
  if (!apiKey) throw new Error('Odds API key required for Trends daily inventory');
  const serviceDate = localParts(now, TIME_ZONE).date;
  const file = scanPath(root, serviceDate);
  if (inFlight.has(file)) return inFlight.get(file);
  const work = (async () => {
    // Do not overwrite a successful daily inventory. A later verifier may
    // use its event IDs, but must refetch prices and status before a post.
    try { return { ...JSON.parse(await fs.readFile(file, 'utf8')), existing: true }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const leagues = {};
    for (const sport of SPORTS) {
      try {
        const response = await readEvents(sport, { apiKey, fetchImpl });
        leagues[sport] = { events: eligibleEvents(response.data, serviceDate, now),
          checkedAt: response.fetchedAt, source: 'The Odds API upcoming events' };
      } catch (error) {
        leagues[sport] = { events: [], error: error.message, checkedAt: now.toISOString() };
      }
    }
    let popularity = { eligibleCombos: 0 };
    try {
      const current = await readPopularCombos({ root, now });
      popularity = { eligibleCombos: current.combos.length,
        comboIds: current.combos.map(row => row.id), source: 'KBH exact-combination requests' };
    } catch (error) { popularity = { eligibleCombos: 0, error: error.message }; }
    const report = { version: 1, serviceDate, timeZone: TIME_ZONE,
      scannedAt: now.toISOString(), leagues, popularity,
      publication: 'held',
      reason: 'Schedule and popularity alone do not verify current odds, licensed history, or game-day availability.' };
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = path.join(path.dirname(file), `.${serviceDate}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, file);
    } finally { await fs.rm(temp, { force: true }); }
    return report;
  })();
  inFlight.set(file, work);
  try { return await work; } finally { inFlight.delete(file); }
}

module.exports = { SPORTS, eligibleEvents, scanPath, scanDaily };
