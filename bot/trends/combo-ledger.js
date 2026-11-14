'use strict';

// Counts explicit requests for an exact combination. Searching individual
// props does not imply that anyone wanted to combine them.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeQuery } = require('./search-ledger');
const { localParts, TIME_ZONE } = require('./schedule');
const { MARKET_BY_STAT } = require('./current-market');

const queues = new Map();
const MIN_DISTINCT_SEARCHERS = 5;

function parseLeg(raw) {
  const cells = String(raw || '').split('|').map(value => value.trim());
  if (cells.length !== 6) throw new Error('Use SPORT|TEAM|PLAYER|STAT|SIDE|LINE for each leg');
  const [sport, team, player, stat, side, line] = cells;
  if (team.length < 3 || team.length > 80 || /[\r\n@]/.test(team)) throw new Error('Each leg needs a team name');
  const query = normalizeQuery({ sport, player, stat, side, line });
  if (!MARKET_BY_STAT[query.sport]?.[query.stat] || !['over', 'under'].includes(query.side))
    throw new Error('Combination leg uses an unsupported current prop market');
  return { ...query, team: team.replace(/\s+/g, ' ').toLocaleLowerCase('en-US') };
}

function normalizeLegs(rawLegs) {
  if (!Array.isArray(rawLegs) || rawLegs.length < 2 || rawLegs.length > 4)
    throw new Error('Choose two to four exact legs');
  const legs = rawLegs.map(parseLeg);
  const identities = legs.map(leg => JSON.stringify(leg));
  if (new Set(identities).size !== identities.length) throw new Error('Duplicate combination leg');
  return legs.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function comboId(legs) {
  return crypto.createHash('sha256').update(JSON.stringify(legs)).digest('hex');
}

async function withLedger({ root, now }, mutate) {
  if (!root) throw new Error('Persistent trends root required');
  const serviceDate = localParts(now, TIME_ZONE).date;
  const directory = path.join(root, 'trends-combos');
  const file = path.join(directory, `${serviceDate}.json`);
  const previous = queues.get(file) || Promise.resolve();
  const current = previous.then(async () => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    let ledger;
    try { ledger = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ledger = { version: 1, serviceDate, salt: crypto.randomBytes(32).toString('hex'), combos: [] };
    }
    if (ledger.version !== 1 || ledger.serviceDate !== serviceDate ||
        !/^[a-f0-9]{64}$/.test(ledger.salt) || !Array.isArray(ledger.combos))
      throw new Error('Trends combination ledger is invalid');
    return mutate({ ledger, file, directory, serviceDate });
  });
  queues.set(file, current.catch(() => {}));
  return current;
}

async function recordCombo({ root, userId, rawLegs, now = new Date() }) {
  if (!/^\d{15,22}$/.test(String(userId || ''))) throw new Error('Discord user ID required');
  const legs = normalizeLegs(rawLegs);
  return withLedger({ root, now }, async ({ ledger, file, directory, serviceDate }) => {
    const id = comboId(legs);
    const searcher = crypto.createHmac('sha256', ledger.salt).update(String(userId)).digest('hex');
    let combo = ledger.combos.find(row => row.id === id);
    if (!combo) {
      combo = { id, legs, searchers: [], firstRequestedAt: now.toISOString() };
      ledger.combos.push(combo);
    }
    if (!Array.isArray(combo.searchers) || JSON.stringify(combo.legs) !== JSON.stringify(legs))
      throw new Error('Trends combination ledger is inconsistent');
    const recorded = !combo.searchers.includes(searcher);
    if (recorded) {
      combo.searchers.push(searcher);
      combo.lastRequestedAt = now.toISOString();
      const temp = path.join(directory, `.${serviceDate}.${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(temp, JSON.stringify(ledger), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, file);
      } finally { await fs.rm(temp, { force: true }); }
    }
    return { id, serviceDate, recorded, distinctSearchers: combo.searchers.length,
      eligibleForPopularityReview: combo.searchers.length >= MIN_DISTINCT_SEARCHERS };
  });
}

async function popularCombos({ root, now = new Date() }) {
  return withLedger({ root, now }, async ({ ledger, serviceDate }) => ({
    serviceDate,
    combos: ledger.combos.filter(row => Array.isArray(row.searchers) &&
      row.searchers.length >= MIN_DISTINCT_SEARCHERS).map(row => ({
      id: row.id, legs: row.legs, distinctSearchers: row.searchers.length,
      lastRequestedAt: row.lastRequestedAt
    }))
  }));
}

module.exports = { MIN_DISTINCT_SEARCHERS, parseLeg, normalizeLegs, recordCombo, popularCombos };
