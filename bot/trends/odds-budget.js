'use strict';

// The Trends-tool may use a small part of KBH's existing Odds API allowance.
// This ledger is conservative: a failed request still consumes its reservation.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { quotaStatus } = require('./odds-api');

const queues = new Map();
const MONTHLY_CAP = 300;
const SHARED_RESERVE = 5000;

async function withOddsBudget({ root, apiKey, fetchImpl = fetch, now = new Date(), cost = 1, operation }) {
  if (!root || !apiKey || !Number.isInteger(cost) || cost < 1 || cost > 3 || typeof operation !== 'function')
    throw new Error('Invalid Trends-tool odds budget request');
  const month = now.toISOString().slice(0, 7);
  const directory = path.join(root, 'trends-odds-budget');
  const file = path.join(directory, `${month}.json`);
  const previous = queues.get(file) || Promise.resolve();
  const current = previous.then(async () => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    let ledger;
    try { ledger = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ledger = { version: 1, month, reserved: 0, requests: [] };
    }
    if (ledger.version !== 1 || ledger.month !== month || !Number.isInteger(ledger.reserved) ||
        ledger.reserved < 0 || !Array.isArray(ledger.requests)) throw new Error('Invalid Trends-tool odds ledger');
    if (ledger.reserved + cost > MONTHLY_CAP) throw new Error('Trends-tool monthly odds allowance is exhausted');
    // /sports is quota-free. Check the *shared* balance immediately before
    // spending, since the arbitrage monitor uses the same API key.
    const quota = await quotaStatus({ apiKey, fetchImpl });
    if (!Number.isInteger(quota.remainingCredits) || quota.remainingCredits - cost < SHARED_RESERVE)
      throw new Error('Shared Odds API reserve would be crossed');
    ledger.reserved += cost;
    ledger.requests.push({ at: now.toISOString(), reserved: cost, remainingBefore: quota.remainingCredits });
    const temp = path.join(directory, `.${month}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, JSON.stringify(ledger), { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, file);
    } finally { await fs.rm(temp, { force: true }); }
    return operation();
  }, async () => { throw new Error('Previous Trends-tool odds budget operation failed'); });
  queues.set(file, current.catch(() => {}));
  return current;
}

module.exports = { MONTHLY_CAP, SHARED_RESERVE, withOddsBudget };
