require('dotenv').config();
const path = require('node:path');
const { Pool } = require('pg');
const { queue, schedule, due, validateItem, mstDate, datePlus, FALLBACK_RECORD } = require('./road-to-truck-schedule');
const { renderCard } = require('./road-to-truck-card');

const ROOT = path.join(__dirname, '..');
const DISCORD_API = 'https://discord.com/api/v10';
const AUDIT_PATH = '/api/admin/road-to-truck/';
const FREE_CHAT_ID = '1276995106779693088'; // Verified existing #💬・community-chat in guild 1215407647155683358.
const GUILD_ID = '1215407647155683358';
const NOTIFICATION_LIMIT = 1900;

function enabled(env) { return env.ROAD_TO_TRUCK_ENABLED !== 'false'; }
function publisherUrl(env, action) { return `${String(env.TRUCK_PUBLISHER_URL || '').replace(/\/$/, '')}${AUDIT_PATH}${action}`; }
function assetUrl(env, date) { return `${String(env.TRUCK_ASSET_URL || '').replace(/\/$/, '')}/assets/road_to_truck/${date}.png`; }
function required(env) {
  for (const name of ['TRUCK_PUBLISHER_URL', 'ROAD_TO_TRUCK_SECRET', 'TRUCK_ASSET_URL', 'TRUCK_ASSET_SECRET', 'DISCORD_TOKEN', 'AUDIT_CHANNEL_ID'])
    if (!env[name]) throw new Error(`Missing ${name}`);
}
async function publisher(env, action, body = null, fetchImpl = fetch) {
  const response = await fetchImpl(publisherUrl(env, action), {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${env.ROAD_TO_TRUCK_SECRET}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${action} failed (${response.status}): ${result.error || 'unknown'}`);
    error.receipt = result;
    throw error;
  }
  return result;
}
async function discordRequest(env, route, method = 'GET', body = null, fetchImpl = fetch) {
  const response = await fetchImpl(`${DISCORD_API}${route}`, {
    method, headers: { authorization: `Bot ${env.DISCORD_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Discord ${method} ${route} failed (${response.status})`);
  return response.status === 204 ? {} : response.json();
}
async function admin(env, message, fetchImpl = fetch) {
  const channel = await discordRequest(env, `/channels/${env.AUDIT_CHANNEL_ID}`, 'GET', null, fetchImpl);
  const deny = channel.permission_overwrites?.find(overwrite => overwrite.id === channel.guild_id && overwrite.type === 0);
  if (channel.type !== 0 || !deny || !(BigInt(deny.deny) & (1n << 10n))) throw new Error('AUDIT_CHANNEL_ID is not an explicitly private text channel');
  return discordRequest(env, `/channels/${channel.id}/messages`, 'POST',
    { content: message.slice(0, NOTIFICATION_LIMIT), allowed_mentions: { parse: [] } }, fetchImpl);
}
async function alert(env, message, fetchImpl = fetch) {
  try { await admin(env, `Road to the truck held: ${message}`, fetchImpl); }
  catch (error) { console.error('Truck admin alert failed:', error.message, 'Original:', message); }
}
async function readRecord(env, fetchImpl = fetch) {
  const result = await publisher(env, 'record', null, fetchImpl);
  if (result.warning) console.warn(result.warning);
  return /^\d+-\d+$/.test(result.record || '') ? result.record : FALLBACK_RECORD;
}
async function uploadCard(env, date, record, fetchImpl = fetch) {
  const { png } = await renderCard({ date, record });
  const url = assetUrl(env, date);
  const response = await fetchImpl(url, { method: 'PUT', headers: {
    authorization: `Bearer ${env.TRUCK_ASSET_SECRET}`, 'content-type': 'image/png' }, body: png });
  if (!response.ok) throw new Error(`Truck card R2 upload failed (${response.status})`);
  return url;
}
function target(item) { return item.platform === 'x' ? '@kobesbettinghub on X' : `#💬・community-chat (${FREE_CHAT_ID})`; }
function show(item, record) {
  const rendered = validateItem(item, record);
  return [`ID: ${item.id}`, `MST: ${item.scheduled_at}`, `UTC: ${new Date(item.scheduled_at).toISOString()}`,
    `Target: ${target(item)}`, `Image: ${item.cardDay ? `assets/road_to_truck/${mstDate(item.scheduled_at)}.png` : 'none'}`,
    `Text:\n${rendered.text}`, ...(item.first_reply ? [`First reply:\n${item.first_reply}`] : [])].join('\n');
}
async function paidLeaderboard(env, item, { database = null, fetchImpl = fetch } = {}) {
  if (!env.DATABASE_URL && !database) throw new Error('DATABASE_URL is required for paid-referral leaderboard');
  const pool = database || new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const end = new Date(item.scheduled_at);
  const start = new Date(end.getTime() - 7 * 86400000);
  try {
    const { rows } = await pool.query(`SELECT referrer_discord_user_id AS user_id, COUNT(*)::int AS n
      FROM referral_rewards WHERE first_paid_at >= $1 AND first_paid_at < $2
      AND first_paid_invoice_id IS NOT NULL AND referrer_discord_user_id IS NOT NULL
      AND status NOT IN ('PENDING_PAYMENT','VOID','REVIEW_REQUIRED')
      GROUP BY referrer_discord_user_id ORDER BY n DESC, user_id ASC LIMIT 3`, [start.toISOString(), end.toISOString()]);
    if (!rows.length) return null;
    const names = [];
    for (const row of rows) {
      const member = await discordRequest(env, `/guilds/${GUILD_ID}/members/${row.user_id}`, 'GET', null, fetchImpl);
      const name = (member.nick || member.user?.global_name || member.user?.username || '').replace(/[\r\n*_`<>@]/g, '').trim().slice(0, 50);
      if (!name) throw new Error(`No confirmed Discord name for ${row.user_id}`);
      names.push({ name, n: Number(row.n) });
    }
    const lead = `week of ${datePlus(item.week, -7)}: referral board`;
    const board = names.map((row, index) => `${index + 1}. ${row.name}, ${row.n}${index === 0 ? ' paid referrals' : ''}`).join('\n');
    return `${lead}\n\n${board}\n\nevery one of these is a step closer to the truck. you get $20 when your friend's first vip payment goes through.\n\nget your link: https://kobesbettinghub.com/refer\n\n21+ | not a guarantee`;
  } finally { if (!database) await pool.end(); }
}
async function sendDiscord(env, item, text, fetchImpl = fetch) {
  const claim = await publisher(env, 'claim', { id: item.id, platform: 'discord', text }, fetchImpl);
  if (claim.status !== 'claimed') return { status: claim.status };
  const channelId = item.channelId || FREE_CHAT_ID;
  const channel = await discordRequest(env, `/channels/${channelId}`, 'GET', null, fetchImpl);
  if (channel.guild_id !== GUILD_ID || channel.type !== 0 || (item.target === 'main_free_chat' && channel.name !== '💬・community-chat'))
    throw new Error('Truck Discord destination does not match verified main free chat');
  const message = await discordRequest(env, `/channels/${channelId}/messages`, 'POST',
    { content: text, allowed_mentions: { parse: [] } }, fetchImpl);
  await publisher(env, 'complete', { id: item.id, platform: 'discord', post_id: message.id }, fetchImpl);
  const link = `https://discord.com/channels/${GUILD_ID}/${channelId}/${message.id}`;
  await admin(env, `Posted ${item.id}: ${link}`, fetchImpl);
  if (item.pin) await discordRequest(env, `/channels/${channelId}/pins/${message.id}`, 'PUT', null, fetchImpl);
  return { status: 'posted', link };
}
async function sendX(env, item, record, fetchImpl = fetch) {
  const rendered = validateItem(item, record);
  let imageUrl = null, imageBase64 = null;
  if (item.cardDay) {
    imageUrl = await uploadCard(env, mstDate(item.scheduled_at), record, fetchImpl);
    const { png } = await renderCard({ date: mstDate(item.scheduled_at), record });
    imageBase64 = png.toString('base64');
  }
  let result;
  try {
    result = await publisher(env, 'x', { id: item.id, platform: 'x', text: rendered.text,
      first_reply: rendered.first_reply, image_base64: imageBase64 }, fetchImpl);
  } catch (error) {
    if (error.receipt?.post_id) {
      const parent = `https://x.com/kobesbettinghub/status/${error.receipt.post_id}`;
      await admin(env, `Partially posted ${item.id}: ${parent}${imageUrl ? `\nCard: ${imageUrl}` : ''}`, fetchImpl);
    }
    throw error;
  }
  if (result.status !== 'posted') return { status: result.status };
  const link = `https://x.com/kobesbettinghub/status/${result.post_id}`;
  const replyLink = `https://x.com/kobesbettinghub/status/${result.reply_post_id}`;
  await admin(env, `Posted ${item.id}: ${link}\nFirst reply: ${replyLink}${imageUrl ? `\nCard: ${imageUrl}` : ''}`, fetchImpl);
  return { status: 'posted', link, replyLink, imageUrl };
}
async function processItem(env, item, record, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    let text = validateItem(item, record).text;
    if (item.id.startsWith('truck-discord-weekly-leaderboard-')) {
      text = await paidLeaderboard(env, item, deps);
      if (!text) {
        await publisher(env, 'skip', { id: item.id, platform: 'discord', reason: 'zero paid referrals in prior 7 days' }, fetchImpl);
        return { status: 'skipped_zero_paid_referrals' };
      }
    }
    return item.platform === 'x' ? await sendX(env, item, record, fetchImpl) : await sendDiscord(env, item, text, fetchImpl);
  } catch (error) {
    await alert(env, `${item.id}: ${error.message}`, fetchImpl);
    return { status: 'held', error: error.message };
  }
}
async function run({ env = process.env, now = new Date(), fetchImpl = fetch, dryRun = false, days = 14 } = {}) {
  if (dryRun) {
    const start = mstDate(now) < '2026-11-19' ? '2026-11-19' : mstDate(now);
    const items = schedule(start, days);
    const record = FALLBACK_RECORD;
    const imagePaths = [];
    for (let n = 0; n < 7; n++) {
      const date = datePlus(start, n);
      if (date < '2026-11-19') continue;
      const filename = `/tmp/kbh-road-to-truck-${date}.png`;
      await renderCard({ date, record, outputPath: filename });
      imagePaths.push(filename);
    }
    return { dryRun: true, writes: 0, items, imagePaths,
      output: `ROAD TO THE TRUCK DRY RUN — no posts or writes\nRecord: ${record} (verified fallback; graded D1 table absent)\nCards: ${imagePaths.join(', ')}\n\n${items.map(item => show(item, record)).join('\n\n---\n\n')}` };
  }
  if (!enabled(env)) return { status: 'disabled', posted: 0 };
  required(env);
  const start = mstDate(new Date(now.getTime() - 3 * 3600000));
  const items = schedule(start, 2);
  const record = await readRecord(env, fetchImpl);
  const { ready, expired } = due(items, now, true);
  for (const item of expired) await publisher(env, 'skip', { id: item.id, platform: item.platform, reason: 'older than 2 hours' }, fetchImpl);
  const results = [];
  for (const item of ready) results.push({ id: item.id, ...await processItem(env, item, record, { fetchImpl }) });
  return { status: 'completed', posted: results.filter(row => row.status === 'posted').length, expired: expired.length, results };
}
async function postWinNudge(rows, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  if (!enabled(env) || !env.ROAD_TO_TRUCK_SECRET || !env.TRUCK_PUBLISHER_URL || !env.AUDIT_CHANNEL_ID) return { status: 'disabled' };
  const { freeRows, verified } = require('../bot/lib/free-pick-results');
  const { resultFor } = require('../bot/lib/pick-log');
  const channelId = env.FREE_PICK_CHANNEL_ID;
  if (!channelId) return { status: 'missing_free_pick_channel' };
  const latest = freeRows(rows, channelId).filter(row => verified(row) && resultFor(row) === 'W' &&
    Date.parse(row.result_verified_at) <= +now && +now - Date.parse(row.result_verified_at) <= 2 * 3600000)
    .sort((a, b) => Date.parse(b.result_verified_at) - Date.parse(a.result_verified_at))[0];
  if (!latest) return { status: 'no_new_win' };
  const match = String(latest.post_reference || '').match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/);
  if (!match || match[1] !== channelId) return { status: 'missing_pick_channel' };
  const item = { ...queue.find(row => row.id === 'truck-discord-post-win-nudge'),
    id: `truck-win-${mstDate(latest.result_verified_at)}`, channelId, target: 'pick_channel' };
  return processItem(env, item, FALLBACK_RECORD, { fetchImpl });
}

if (require.main === module) {
  run({ dryRun: process.argv.includes('--dry-run') }).then(result => {
    console.log(result.dryRun ? result.output : JSON.stringify(result));
  }).catch(error => { console.error('Truck scheduler held:', error.message); process.exitCode = 1; });
}
module.exports = { run, postWinNudge, paidLeaderboard, enabled, processItem, sendDiscord, sendX, show, target };
