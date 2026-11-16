'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { events } = require('./odds-api');
const { popularCombos } = require('./combo-ledger');
const { selectEligibleCombo, scanNbaPopular } = require('./nba-popular-auto');
const { scanNflPopular } = require('./nfl-popular-auto');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');

const SCANNERS = Object.freeze({ NBA: scanNbaPopular, NFL: scanNflPopular });

function eligibleSlates(combos, schedules, now, date) {
  return Object.entries(schedules).flatMap(([sport, rows]) => {
    if (!SCANNERS[sport]) return [];
    const games = (rows || []).filter(row => belongsToServiceDate(row.commence_time, date));
    const combo = selectEligibleCombo(combos, rows || [], now, date, sport);
    return combo ? [{ sport, games: games.length, members: combo.distinctSearchers }] : [];
  }).sort((a, b) => b.games - a.games || b.members - a.members || a.sport.localeCompare(b.sport));
}

async function scanCrossSportPopular({ root, oddsKey, bdlKey, channelId, channelFor,
  now = new Date(), fetchImpl = fetch, readEvents = events, readCombos = popularCombos,
  scanners = SCANNERS } = {}) {
  if (!root || !oddsKey || !channelId || typeof channelFor !== 'function')
    throw new Error('Cross-sport popular destination is incomplete');
  const date = localParts(now, TIME_ZONE).date;
  const file = path.join(root, 'trends-popular', `cross-${date}.json`);
  try { return { ...JSON.parse(await fs.readFile(file, 'utf8')), existing: true }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const measured = await readCombos({ root, now });
  const priorSports = {};
  for (const sport of Object.keys(scanners)) {
    try { priorSports[sport] = JSON.parse(await fs.readFile(path.join(root,
      'trends-popular', `${sport.toLowerCase()}-${date}.json`), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const published = Object.values(priorSports).find(row => row?.status === 'published');
  if (published) return { status: 'published', date, sport: published.sport || 'NBA',
    messageId: published.messageId, existing: true };
  const uncertain = Object.values(priorSports).find(row =>
    ['reserved', 'needs_reconciliation'].includes(row?.status));
  if (uncertain) return { status: 'needs_reconciliation', date, existing: true };
  const schedules = {};
  for (const sport of Object.keys(scanners)) {
    if (sport === 'NBA' && !bdlKey) continue;
    try { schedules[sport] = (await readEvents(sport, { apiKey: oddsKey, fetchImpl })).data || []; }
    catch (error) { console.warn(`Popular ${sport} schedule held:`, error.message); }
  }
  const choices = eligibleSlates(measured.combos, schedules, now, date)
    .filter(row => !priorSports[row.sport]);
  if (!choices.length) return { status: 'waiting', date,
    reason: 'No measured five-member exact combo is in a verified pregame slate' };
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const reserved = { status: 'reserved', date, sport: choices[0].sport,
    slateGames: choices[0].games, at: now.toISOString() };
  try { await fs.writeFile(file, JSON.stringify(reserved), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', date }; throw error; }
  let outcome;
  try {
    const sport = choices[0].sport;
    const receipt = await scanners[sport]({ root, oddsKey, bdlKey, channelId,
      channelFor, now, fetchImpl, readCombos, readEvents });
    outcome = { ...reserved, status: receipt.status, messageId: receipt.messageId || null,
      reason: receipt.reason || null };
    if (['waiting', 'held'].includes(receipt.status)) {
      await fs.rm(file, { force: true });
      return outcome;
    }
  } catch (error) {
    outcome = { ...reserved, status: 'needs_reconciliation', reason: error.message };
  }
  await fs.writeFile(file, JSON.stringify(outcome, null, 2), { mode: 0o600 });
  return outcome;
}

module.exports = { eligibleSlates, scanCrossSportPopular };
