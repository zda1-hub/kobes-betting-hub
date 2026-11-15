'use strict';

// One near-tip quote/status check for each new NBA publication, plus a
// no-cost transition to a historical snapshot at tipoff. This does not place
// wagers or infer that an unlisted player will participate.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const bdl = require('./bdl-nba');
const { playerNameKey } = require('./player-name');
const { localParts, TIME_ZONE } = require('./schedule');

const inFlight = new Map();
const CHECK_WINDOW_MS = 25 * 60_000;
const MAX_CHECKS_PER_DAY = 4;

function quoteStatus(source, selections, now) {
  const exact = (selections || []).find(row => row.market === source.market &&
    row.sportsbookKey === source.sportsbookKey && row.side === source.side &&
    row.line === source.line && playerNameKey(row.player) === playerNameKey(source.player));
  if (!exact) return 'Original line is no longer listed at the quoted book. Check a current market.';
  if (!Number.isFinite(Date.parse(exact.updatedAt)) ||
      Date.parse(exact.updatedAt) > now.valueOf() ||
      now.valueOf() - Date.parse(exact.updatedAt) > 5 * 60_000)
    return 'The quote could not be verified as current. Check a current market.';
  if (exact.odds !== source.odds) {
    const price = exact.odds > 0 ? `+${exact.odds}` : exact.odds;
    return `Price moved to ${price} at the original book (${exact.updatedAt}). The original quote is outdated.`;
  }
  return `Original line and price rechecked ${exact.updatedAt}; game participation is not confirmed.`;
}

function statusContent(receipt, label) {
  const original = receipt.originalContent;
  if (typeof original !== 'string' || !original) throw new Error('Original trend content unavailable');
  const content = `**UPDATE: ${label}**\n${original}`;
  if (content.length > 2000) throw new Error('Updated trend exceeds Discord limit');
  return content;
}

async function writeReceipt(file, receipt) {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' });
    await fs.rename(tmp, file);
  } finally { await fs.rm(tmp, { force: true }); }
}

async function editOnce({ file, receipt, channelFor, content, stage, now }) {
  const channel = await channelFor(receipt.channelId);
  if (!channel?.isTextBased?.() || channel.id !== receipt.channelId ||
      typeof channel.messages?.fetch !== 'function')
    throw new Error('Original private Trends channel cannot be verified');
  const message = await channel.messages.fetch(receipt.messageId);
  if (!message || message.id !== receipt.messageId)
    throw new Error('Original Trends message cannot be verified');
  const prepared = { ...receipt, monitor: { status: 'editing', stage, content,
    at: now.toISOString() } };
  await writeReceipt(file, prepared);
  try {
    await message.edit({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    // Editing may have succeeded despite a network error. A later run must
    // compare the visible message before resolving; never blindly retry.
    throw new Error(`Trend edit uncertain; reconcile message ${receipt.messageId}: ${error.message}`);
  }
  const done = { ...prepared, monitor: { status: 'updated', stage, content,
    at: now.toISOString() } };
  await writeReceipt(file, done);
  return done;
}

async function reconcileEditing({ file, receipt, channelFor, now }) {
  const channel = await channelFor(receipt.channelId);
  if (!channel?.isTextBased?.() || channel.id !== receipt.channelId ||
      typeof channel.messages?.fetch !== 'function')
    return { ...receipt, monitor: { ...receipt.monitor, status: 'needs_reconciliation' } };
  const message = await channel.messages.fetch(receipt.messageId);
  if (message?.content !== receipt.monitor.content)
    return { ...receipt, monitor: { ...receipt.monitor, status: 'needs_reconciliation' } };
  const done = { ...receipt, monitor: { ...receipt.monitor, status: 'updated', at: now.toISOString() } };
  await writeReceipt(file, done);
  return done;
}

async function refreshOne({ file, root, apiKey, bdlKey, channelFor, now,
  readOdds, readAvailability, reserveOdds, fetchImpl }) {
  if (inFlight.has(file)) return inFlight.get(file);
  const run = (async () => {
    let receipt = JSON.parse(await fs.readFile(file, 'utf8'));
    const source = receipt.monitorSource;
    if (receipt.status !== 'published' || !receipt.messageId ||
        source?.sport !== 'NBA' || !Number.isInteger(source.playerId) ||
        !source.market || !source.sportsbookKey || !Number.isFinite(Date.parse(source.startsAt)))
      return { status: 'legacy_or_unmonitorable', id: receipt.id };
    if (receipt.monitor?.status === 'editing') {
      receipt = await reconcileEditing({ file, receipt, channelFor, now });
      if (receipt.monitor.status !== 'updated') return { status: 'needs_reconciliation', id: receipt.id };
    }
    if (receipt.monitor?.status === 'needs_reconciliation')
      return { status: 'needs_reconciliation', id: receipt.id };
    const untilStart = Date.parse(source.startsAt) - now.valueOf();
    if (untilStart <= 0) {
      if (receipt.monitor?.stage === 'started') return { status: 'already_started', id: receipt.id };
      receipt = await editOnce({ file, receipt, channelFor,
        content: statusContent(receipt, 'GAME STARTED — historical pregame snapshot; no current quote is implied.'),
        stage: 'started', now });
      return { status: 'started', id: receipt.id };
    }
    if (untilStart > CHECK_WINDOW_MS || receipt.monitor?.stage === 'near_tip')
      return { status: 'waiting_or_checked', id: receipt.id };
    let label;
    try {
      const available = await readAvailability({ playerId: source.playerId,
        now, apiKey: bdlKey, fetchImpl });
      if (available.status !== 'active-roster-no-listed-injury' ||
          available.rightsUrl !== bdl.TERMS_URL)
        label = 'Player availability is no longer verified; do not treat this as a current pick.';
    } catch (_error) {
      label = 'Player availability could not be rechecked; do not treat this as a current pick.';
    }
    if (!label) {
      try {
        const odds = await reserveOdds({ root, apiKey, fetchImpl, now, cost: 1,
          operation: () => readOdds('NBA', source.eventId,
            { apiKey, fetchImpl, market: source.market }) });
        label = quoteStatus(source, odds.selections, now);
      } catch (_error) {
        label = 'The quote could not be rechecked within the configured odds budget. Check a current market.';
      }
    }
    receipt = await editOnce({ file, receipt, channelFor,
      content: statusContent(receipt, label), stage: 'near_tip', now });
    return { status: 'near_tip_checked', id: receipt.id, label };
  })();
  inFlight.set(file, run);
  try { return await run; } finally { inFlight.delete(file); }
}

async function refreshPublishedNbaTrends({ root, apiKey, bdlKey, channelFor,
  now = new Date(), fetchImpl = fetch, readOdds = eventAlternateOdds,
  readAvailability = bdl.availability, reserveOdds = withOddsBudget } = {}) {
  if (!root || !apiKey || !bdlKey || typeof channelFor !== 'function')
    throw new Error('NBA Trends refresh requires storage, data keys and private channel access');
  const date = localParts(now, TIME_ZONE).date;
  const dates = [date, localParts(new Date(now.valueOf() - 24 * 60 * 60_000), TIME_ZONE).date];
  const results = [];
  for (const day of [...new Set(dates)]) {
    const directory = path.join(root, 'trends-publications', day);
    let names;
    try { names = (await fs.readdir(directory)).filter(name => /^[a-f0-9]{32}\.json$/.test(name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of names.slice(0, MAX_CHECKS_PER_DAY)) {
      const file = path.join(directory, name);
      results.push(await refreshOne({ file, root, apiKey, bdlKey, channelFor, now,
        readOdds, readAvailability, reserveOdds, fetchImpl }));
    }
  }
  return results;
}

module.exports = { CHECK_WINDOW_MS, MAX_CHECKS_PER_DAY, quoteStatus,
  refreshPublishedNbaTrends };
