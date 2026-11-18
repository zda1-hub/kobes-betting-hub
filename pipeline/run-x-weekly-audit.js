require('dotenv').config();
const { windowFor, fetchOwnPosts, aggregate, markdown } = require('./x-weekly-audit');

const STORE_PATH = '/api/admin/x-audit-reports';
const DISCORD_API = 'https://discord.com/api/v10';
const VIEW_CHANNEL = 1n << 10n;

function storeUrl(env) { return `${(env.X_AUDIT_STORE_URL || '').replace(/\/$/, '')}${STORE_PATH}`; }
async function previousReport(env, weekStart, fetchImpl = fetch) {
  if (!env.X_AUDIT_STORE_URL || !env.X_AUDIT_INGEST_SECRET) return null;
  const url = new URL(storeUrl(env)); url.searchParams.set('before', weekStart);
  const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${env.X_AUDIT_INGEST_SECRET}` } });
  if (!response.ok) throw new Error(`Prior X audit read failed: HTTP ${response.status}`);
  return (await response.json()).report?.json || null;
}
async function saveReport(env, report, body, fetchImpl = fetch) {
  if (!env.X_AUDIT_STORE_URL || !env.X_AUDIT_INGEST_SECRET) throw new Error('X audit D1 report store is not configured.');
  const response = await fetchImpl(storeUrl(env), { method: 'POST', headers: {
    Authorization: `Bearer ${env.X_AUDIT_INGEST_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: report.id, week_start: report.week_start, json: report, markdown: body }) });
  if (!response.ok) throw new Error(`X audit D1 save failed: HTTP ${response.status}`);
  return response.json();
}
async function postAdminDiscord(env, report, body, fetchImpl = fetch) {
  if (!env.DISCORD_TOKEN || !env.AUDIT_CHANNEL_ID) throw new Error('Private Discord audit channel credentials are missing.');
  const headers = { Authorization: `Bot ${env.DISCORD_TOKEN}` };
  const channelResponse = await fetchImpl(`${DISCORD_API}/channels/${env.AUDIT_CHANNEL_ID}`, { method: 'GET', headers });
  if (!channelResponse.ok) throw new Error(`Audit channel read failed: HTTP ${channelResponse.status}`);
  const channel = await channelResponse.json();
  const deny = channel.permission_overwrites?.find(item => item.id === channel.guild_id && item.type === 0);
  if (channel.type !== 0 || !deny || !(BigInt(deny.deny) & VIEW_CHANNEL))
    throw new Error('AUDIT_CHANNEL_ID is not verified as a private text channel; report held.');
  const form = new FormData();
  form.set('payload_json', JSON.stringify({ content: `KBH weekly X audit · ${report.week_start} MST`, allowed_mentions: { parse: [] } }));
  form.set('files[0]', new Blob([body], { type: 'text/markdown' }), `kbh-x-audit-${report.week_start}.md`);
  const response = await fetchImpl(`${DISCORD_API}/channels/${channel.id}/messages`, { method: 'POST', headers, body: form });
  if (!response.ok) throw new Error(`Private Discord audit delivery failed: HTTP ${response.status}`);
  return { channelId: channel.id, messageId: (await response.json()).id };
}

async function run({ env = process.env, dryRun = false, now = new Date(), fetchImpl = fetch,
  fetchPosts = fetchOwnPosts, getPrevious = previousReport, save = saveReport, post = postAdminDiscord } = {}) {
  const handle = (env.KBH_X_HANDLE || '').replace(/^@/, '');
  if (!handle || !env.X_BEARER_TOKEN) throw new Error('KBH_X_HANDLE and X_BEARER_TOKEN are required.');
  const range = windowFor(now);
  const { posts, reads } = await fetchPosts({ handle, token: env.X_BEARER_TOKEN, range, fetchImpl });
  const previous = await getPrevious(env, range.weekStart, fetchImpl);
  const report = aggregate(posts, handle, range, previous, now);
  report.xReads = reads;
  const body = markdown(report);
  if (dryRun) return { report, markdown: body, dryRun: true, writes: 0 };
  await save(env, report, body, fetchImpl);
  const delivery = await post(env, report, body, fetchImpl);
  return { report, markdown: body, delivery, writes: 2 };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).then(receipt => {
    if (dryRun) console.log(receipt.markdown);
    else console.log(JSON.stringify({ weekStart: receipt.report.week_start, xReads: receipt.report.xReads, delivery: receipt.delivery }));
  }).catch(error => { console.error(`Weekly X audit held: ${error.message}`); process.exitCode = 1; });
}

module.exports = { run, previousReport, saveReport, postAdminDiscord };
