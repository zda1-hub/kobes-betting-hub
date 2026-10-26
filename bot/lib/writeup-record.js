const { distinctCapperWagers } = require('./capper-recap');
const { verified } = require('./free-pick-results');
const { resultFor } = require('./pick-log');

function writeupChannelIds(env = process.env) {
  const configured = env.PUBLIC_WRITEUP_CHANNEL_IDS
    ? env.PUBLIC_WRITEUP_CHANNEL_IDS.split(',')
    : [env.DAILY_WRITEUPS_CHANNEL_ID, env.BASKETBALL_WRITEUPS_CHANNEL_ID,
      ...(env.SPORT_CHANNEL_MAP || '').split(',').map(item => item.split(':')[1])];
  const excluded = new Set([env.EXPERT_PICKS_CHANNEL_ID, env.HOCKEY_PICK_CHANNEL_ID,
    env.FREE_PICK_CHANNEL_ID].filter(Boolean));
  return [...new Set(configured.map(value => String(value || '').trim())
    .filter(value => /^\d+$/.test(value) && !excluded.has(value)))];
}

function channelIds(row) {
  return [...new Set([...(row.publication_channel_ids || []),
    String(row.post_reference || '').match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/)?.[1]].filter(Boolean))];
}

function buildWriteupRecord(published, today, allowedChannelIds) {
  if (!allowedChannelIds.length) return null;
  const groups = new Map();
  for (const row of published) {
    if (!channelIds(row).some(id => allowedChannelIds.includes(id))) continue;
    // A writeup wager is one call even if a repost credits another source.
    // The existing wager identity retains event, market, price and stake.
    const key = row.operating_date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const rows = [...groups.values()].flatMap(group => distinctCapperWagers(group).map(entry => entry.row));
  const record = { scope: 'writeup_channels', wins: 0, losses: 0, pushes: 0, voids: 0, pending: 0,
    trackingSince: rows.length ? rows.map(row => row.operating_date).sort()[0] : null, through: today };
  for (const row of rows) {
    if (!verified(row)) { record.pending++; continue; }
    const key = { W: 'wins', L: 'losses', P: 'pushes', V: 'voids' }[resultFor(row)];
    if (key) record[key]++;
  }
  // No stored percentage: consumers calculate W / (W + L) from these counts.
  return record;
}

module.exports = { buildWriteupRecord, writeupChannelIds };
