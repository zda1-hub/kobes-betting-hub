'use strict';

// Private, first-party search evidence. A daily random salt makes stored
// Discord identifiers unlinkable across days; no raw user ID is written.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { localParts, TIME_ZONE } = require('./schedule');

const queues = new Map();
const SPORTS = new Set(['NBA', 'NFL', 'MLB', 'NHL']);

function normalizeQuery(query) {
  const sport = String(query.sport || '').toUpperCase();
  const player = String(query.player || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  const stat = String(query.stat || '').trim().toLowerCase();
  const side = String(query.side || '').trim().toLowerCase();
  const line = Number(query.line);
  if (!SPORTS.has(sport) || player.length < 3 || player.length > 100 ||
      !/^[a-z_]{3,40}$/.test(stat) || !['over', 'under', 'at_least'].includes(side) ||
      !Number.isFinite(line) || line < 0 || line > 1000) throw new Error('Invalid trends search');
  return { sport, player, stat, side, line };
}

function serialize(operation, key) {
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.then(operation, operation);
  queues.set(key, current.catch(() => {}));
  return current;
}

async function recordSearch({ root, userId, query, now = new Date() }) {
  if (!root || !/^\d{15,22}$/.test(String(userId || ''))) throw new Error('Persistent root and Discord user ID required');
  const normalized = normalizeQuery(query);
  const date = localParts(now, TIME_ZONE).date;
  const directory = path.join(root, 'trends-searches');
  const file = path.join(directory, `${date}.json`);
  return serialize(async () => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    let ledger;
    try { ledger = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ledger = { version: 1, serviceDate: date, salt: crypto.randomBytes(32).toString('hex'), searches: [] };
    }
    if (ledger.version !== 1 || ledger.serviceDate !== date || !/^[a-f0-9]{64}$/.test(ledger.salt) ||
        !Array.isArray(ledger.searches)) throw new Error('Trends search ledger is invalid');
    const searcher = crypto.createHmac('sha256', ledger.salt).update(String(userId)).digest('hex');
    const entry = { ...normalized, searcher, searchedAt: now.toISOString() };
    const duplicate = ledger.searches.some(row => row.searcher === searcher &&
      row.sport === entry.sport && row.player === entry.player && row.stat === entry.stat &&
      row.side === entry.side && row.line === entry.line);
    if (duplicate) return { recorded: false, date };
    ledger.searches.push(entry);
    const temp = path.join(directory, `.${date}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, JSON.stringify(ledger), { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, file);
    } finally { await fs.rm(temp, { force: true }); }
    return { recorded: true, date };
  }, file);
}

module.exports = { normalizeQuery, recordSearch };
