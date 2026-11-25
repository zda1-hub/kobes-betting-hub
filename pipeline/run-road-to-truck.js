require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs/promises');
const { Pool } = require('pg');
const { queue, schedule, due, validateItem, mstDate, datePlus, FALLBACK_RECORD } = require('./road-to-truck-schedule');
const { renderCard, renderDailyCard } = require('./road-to-truck-card');
const { buildDaily } = require('./truck-daily');
const { enabled } = require('./truck-activation');

const ROOT = path.join(__dirname, '..');
const DISCORD_API = 'https://discord.com/api/v10';
const AUDIT_PATH = '/api/admin/road-to-truck/';
const FREE_CHAT_ID = '1276995106779693088'; // Verified existing #💬・community-chat in guild 1215407647155683358.
const GUILD_ID = '1215407647155683358';
const NOTIFICATION_LIMIT = 1900;

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
  const { png,hasPhoto } = await renderCard({ date, record });
  if(!hasPhoto) throw new Error('Real Cybertruck photo missing; card held');
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
  if (env.NAME_WALL_ENABLED === 'true') {
    const {api}=require('./name-wall-sync');
    const data=await api(env,'leaderboard',null,fetchImpl);
    if (!data.rows?.length) return null;
    return `truck wall leaderboard · ${item.week}\n\n${data.rows.map((row,index)=>`${index+1}. ${row.name} · ${row.tier}`).join('\n')}\n\nspot ${data.spot} of 200. get your link: https://kobesbettinghub.com/refer\n\n21+ | not a guarantee`;
  }
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
    { content: item.pingEveryone ? `@everyone\n${text}` : text,
      allowed_mentions: { parse: item.pingEveryone ? ['everyone'] : [] } }, fetchImpl);
  await publisher(env, 'complete', { id: item.id, platform: 'discord', post_id: message.id }, fetchImpl);
  const link = `https://discord.com/channels/${GUILD_ID}/${channelId}/${message.id}`;
  await admin(env, `Posted ${item.id}: ${link}`, fetchImpl);
  if (item.pin) await discordRequest(env, `/channels/${channelId}/pins/${message.id}`, 'PUT', null, fetchImpl);
  return { status: 'posted', link };
}
async function sendX(env, item, record, fetchImpl = fetch, prepared = null) {
  const rendered = validateItem(item, record);
  let imageUrl = prepared?.url || null, imageBase64 = prepared?.png?.toString('base64') || null;
  if (item.cardDay) {
    imageUrl = await uploadCard(env, mstDate(item.scheduled_at), record, fetchImpl);
    const { png } = await renderCard({ date: mstDate(item.scheduled_at), record });
    imageBase64 = png.toString('base64');
  } else if (item.image) {
    if (!/^assets\/road_to_truck\/[a-z0-9_.-]+\.(?:png|jpe?g)$/.test(item.image))
      throw new Error('Truck image must be a committed campaign asset');
    const bytes = await fs.readFile(path.join(ROOT, item.image));
    if (bytes.length > 5_500_000) throw new Error('Truck image exceeds X upload limit');
    imageBase64 = bytes.toString('base64');
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
async function truckChannels(env, fetchImpl = fetch) {
  const channels=await discordRequest(env,`/guilds/${GUILD_ID}/channels`,'GET',null,fetchImpl);
  const category=channels.find(c=>c.name==='🛻 ROAD TO THE TRUCK'&&c.type===4);
  const pick=name=>channels.find(c=>c.name===name&&c.parent_id===category?.id&&c.type===0);
  const wall=pick('truck-wall'), guide=pick('how-to-get-on-the-truck');
  if(!wall||!guide) throw new Error('Truck wall or pinned guide channel is missing');
  return {wall,guide,roadCrew:pick('road-crew'),hoodClub:pick('hood-club')};
}
async function editGuide(env, spot, channels, fetchImpl=fetch) {
  const pins=await discordRequest(env,`/channels/${channels.guide.id}/pins`,'GET',null,fetchImpl);
  const me=await discordRequest(env,'/users/@me','GET',null,fetchImpl);
  const pinned=pins.find(m=>m.author?.id===me.id&&m.embeds?.some(e=>e.footer?.text?.startsWith('KBH truck wall explainer')));
  if(!pinned) throw new Error('Pinned truck explainer missing');
  const ids={'road-crew':channels.roadCrew?.id,'hood-club':channels.hoodClub?.id};
  const {explainer}=require('../bot/lib/truck-wall');
  return discordRequest(env,`/channels/${channels.guide.id}/messages/${pinned.id}`,'PATCH',
    {embeds:[explainer(spot,ids).toJSON()],allowed_mentions:{parse:[]}},fetchImpl);
}
async function sendDailyDiscord(env, item, png, channelId, fetchImpl=fetch) {
  const claim=await publisher(env,'claim',{id:item.id+'-discord',platform:'discord',text:item.text},fetchImpl);
  if(claim.status!=='claimed') return {status:claim.status};
  const form=new FormData();
  form.append('payload_json',JSON.stringify({content:item.text,allowed_mentions:{parse:[]}}));
  form.append('files[0]',new Blob([png],{type:'image/png'}),`${item.id}.png`);
  const response=await fetchImpl(`${DISCORD_API}/channels/${channelId}/messages`,{
    method:'POST',headers:{authorization:`Bot ${env.DISCORD_TOKEN}`},body:form});
  if(!response.ok) throw new Error(`Discord daily image post failed (${response.status})`);
  const message=await response.json();
  await publisher(env,'complete',{id:item.id+'-discord',platform:'discord',post_id:message.id},fetchImpl);
  const link=`https://discord.com/channels/${GUILD_ID}/${channelId}/${message.id}`;
  await admin(env,`Posted ${item.id} to truck wall: ${link}`,fetchImpl);
  return {status:'posted',link};
}
async function postDaily(env, planned, fetchImpl=fetch) {
  const {api}=require('./name-wall-sync');
  const snapshot=await api(env,'daily',null,fetchImpl);
  if(Date.now()-Date.parse(snapshot.verifiedAt)>10*60000 || Date.parse(snapshot.verifiedAt)>Date.now()+60000)
    throw new Error('Verified wall spot is stale; daily post skipped');
  const date=mstDate(planned.scheduled_at);
  const item=buildDaily(snapshot,date);
  const channels=await truckChannels(env,fetchImpl);
  const {receipt}=await api(env,`receipt?id=truck:guide:${date}`,null,fetchImpl);
  if(!receipt) {
    await editGuide(env,item.spot,channels,fetchImpl);
    await api(env,'receipt',{id:`truck:guide:${date}`,value:`active paid VIPs ${item.spot}`},fetchImpl);
  }
  if(item.skipReason) {
    await publisher(env,'skip',{id:item.id,platform:'x',reason:item.skipReason},fetchImpl);
    await publisher(env,'skip',{id:item.id+'-discord',platform:'discord',reason:item.skipReason},fetchImpl);
    console.info(`Truck daily ${date} skipped: ${item.skipReason}`);
    return {status:'skipped_no_new_names',day:item.day,spot:item.spot};
  }
  const card=await renderDailyCard({day:item.day,spot:item.spot,wallNames:item.wallNames,topRef:item.topRef});
  const url=assetUrl(env,`daily-${date}`);
  const uploaded=await fetchImpl(url,{method:'PUT',headers:{authorization:`Bearer ${env.TRUCK_ASSET_SECRET}`,'content-type':'image/png'},body:card.png});
  if(!uploaded.ok) throw new Error(`Truck daily card upload failed (${uploaded.status})`);
  const x=await sendX(env,item,FALLBACK_RECORD,fetchImpl,{png:card.png,url});
  const discord=await sendDailyDiscord(env,item,card.png,channels.wall.id,fetchImpl);
  return {status:x.status==='posted'||discord.status==='posted'?'posted':'already_handled',x,discord,day:item.day,spot:item.spot};
}
async function postLaunch(env, fetchImpl=fetch) {
  const {api}=require('./name-wall-sync');
  const {receipt}=await api(env,'receipt?id=truck:announcement',null,fetchImpl);
  if(receipt) return {status:'already_handled'};
  const snapshot=await api(env,'daily',null,fetchImpl);
  if(!Number.isInteger(snapshot.spot) || Date.now()-Date.parse(snapshot.verifiedAt)>10*60000)
    throw new Error('Verified wall spot unavailable for launch announcement');
  const channels=await truckChannels(env,fetchImpl);
  const guildChannels=await discordRequest(env,`/guilds/${GUILD_ID}/channels`,'GET',null,fetchImpl);
  const named=name=>guildChannels.find(c=>c.type===0&&(c.name===name||c.name.endsWith(`・${name}`)));
  const destination=named('announcements')||named('free-picks');
  if(!destination) throw new Error('No verified announcements or free-picks channel for launch');
  const text=require('../bot/lib/truck-wall').announcement(channels.guide.id,snapshot.spot);
  const item={id:'truck-discord-launch-announcement',platform:'discord',channelId:destination.id,target:'launch',
    pingEveryone:env.ROAD_TO_TRUCK_PING_EVERYONE==='true'};
  return sendDiscord(env,item,text,fetchImpl);
}
async function processItem(env, item, record, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    if(item.daily) return await postDaily(env,item,fetchImpl);
    if(item.sourceId?.startsWith('truck-referral-safe-')) {
      const snapshot=await require('./name-wall-sync').api(env,'daily',null,fetchImpl);
      if(!Number.isInteger(snapshot.spot) || Date.now()-Date.parse(snapshot.verifiedAt)>10*60000)
        throw new Error('Verified wall spot unavailable for referral post');
      item={...item,text:item.text.replaceAll('{X}',String(snapshot.spot))};
    }
    let text = validateItem(item, record).text;
    if (item.id.startsWith('truck-discord-weekly-leaderboard-')) {
      text = await paidLeaderboard(env, item, deps);
      if (!text) {
        await publisher(env, 'skip', { id: item.id, platform: 'discord', reason: 'zero paid referrals in prior 7 days' }, fetchImpl);
        return { status: 'skipped_zero_paid_referrals' };
      }
      if (env.NAME_WALL_ENABLED === 'true') {
        const channels=await discordRequest(env,`/guilds/${GUILD_ID}/channels`,'GET',null,fetchImpl);
        const category=channels.find(c=>c.name==='🛻 ROAD TO THE TRUCK'&&c.type===4);
        const wall=channels.find(c=>c.name==='truck-wall'&&c.parent_id===category?.id&&c.type===0);
        if (!wall) throw new Error('Verified truck-wall channel is missing');
        item={...item,channelId:wall.id,target:'truck_wall'};
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
    const start=mstDate(now)<'2026-11-19'?'2026-11-19':mstDate(now);
    const previewDate=start<'2026-11-20'?'2026-11-20':start;
    let snapshot=null, blocked=null, imagePath=null;
    try {
      if(!env.TRUCK_PUBLISHER_URL||!env.ROAD_TO_TRUCK_SECRET)
        throw new Error('Read-only wall API credentials are unavailable in this local shell');
      snapshot=await require('./name-wall-sync').api(env,'daily',null,fetchImpl);
      const item=buildDaily(snapshot,previewDate);
      const target=`/tmp/kbh-truck-daily-${previewDate}.png`;
      await renderDailyCard({day:item.day,spot:item.spot,wallNames:snapshot.wallNames,topRef:snapshot.topRefCount>=1?snapshot.topRef:null,outputPath:target});
      imagePath=target;
    } catch(error) { blocked=error.message; }
    const captions=[];
    for(let i=0;i<7;i++) {
      const date=datePlus(start,i);
      if(date<'2026-11-20') { captions.push(`${date}: no automatic daily card; first card is Friday 10:00 MST`); continue; }
      if(!snapshot) captions.push(`${date} 10:00 MST: live spot unavailable; caption held`);
      else try {
        const item=buildDaily(snapshot,date);
        captions.push(item.skipReason?`${date} 10:00 MST: SKIP (${item.skipReason})`
          :`${date} 10:00 MST [preview using current snapshot; actual values refresh at posting]:\n${item.text}\nFirst reply:\n${item.first_reply}`);
      } catch(error) { captions.push(`${date}: held (${error.message})`); }
      for(const referral of schedule(date,1).filter(item=>item.sourceId?.startsWith('truck-referral-safe-'))) {
        captions.push(snapshot
          ?`${date} 12:00 MST [preview using current snapshot]:\n${referral.text.replaceAll('{X}',String(snapshot.spot))}\nFirst reply:\n${referral.first_reply}`
          :`${date} 12:00 MST: referral caption held; live spot unavailable`);
      }
    }
    const output=`ROAD TO THE CYBERTRUCK — READ-ONLY DRY RUN\nCurrent active paid VIPs: ${snapshot?.spot ?? 'unavailable'} of 200\nToday's preview card (${previewDate}): ${imagePath||'not rendered'}\n${blocked?`Blocked: ${blocked}\n`:''}\nNext 7 days:\n\n${captions.join('\n\n---\n\n')}`;
    const reportPath=`/tmp/kbh-truck-daily-${previewDate}.txt`;
    await fs.writeFile(reportPath,output+'\n');
    return {dryRun:true,externalWrites:0,imagePath,reportPath,blocked,snapshot,captions,output};
  }
  if (env.NAME_WALL_ENABLED === 'true') {
    try {
      const wall = await require('./name-wall-sync').sync({ env, fetchImpl });
      if (wall.tierEvents?.length) console.log('Name wall tier changes pending Discord delivery:', JSON.stringify(wall.tierEvents));
      for(const flag of wall.alerts||[]) await admin(env,`Truck wall review flag: referrer ${flag.referrerId}; referred customer ${flag.customerId}; reason ${flag.reason}. No automatic penalty applied.`,fetchImpl);
      if(enabled(env,now) && wall.status!=='synced') {
        await alert(env,`verified wall sync is ${wall.status}; no daily post`,fetchImpl);
        return {status:'held_wall_unsynced',posted:0};
      }
    } catch(error) {
      if(enabled(env,now)) await alert(env,`verified wall sync failed: ${error.message}`,fetchImpl);
      if(enabled(env,now)) return {status:'held_wall_sync_error',posted:0,error:error.message};
      throw error;
    }
  }
  if (!enabled(env,now)) return { status: 'disabled', posted: 0 };
  required(env);
  if(env.NAME_WALL_ENABLED!=='true') {
    await alert(env,'NAME_WALL_ENABLED is off; no verified wall spot is available',fetchImpl);
    return {status:'held_wall_off',posted:0};
  }
  const start = mstDate(new Date(now.getTime() - 3 * 3600000));
  const items = schedule(start, 2);
  const record = await readRecord(env, fetchImpl);
  const { ready, expired } = due(items, now, true);
  for (const item of expired) await publisher(env, 'skip', { id: item.id, platform: item.platform, reason: 'older than 2 hours' }, fetchImpl);
  const results = [];
  try { results.push({id:'truck-discord-launch-announcement',...await postLaunch(env,fetchImpl)}); }
  catch(error) { await alert(env,`launch announcement: ${error.message}`,fetchImpl); }
  for (const item of ready) results.push({ id: item.id, ...await processItem(env, item, record, { fetchImpl }) });
  if (env.NAME_WALL_ENABLED === 'true') {
    const {api}=require('./name-wall-sync');
    const milestones=await api(env,'milestones',null,fetchImpl);
    for (const mark of milestones.milestones || []) {
      const item={id:`truck-wall-milestone-${mark.spot}`,platform:'x',scheduled_at:mark.claimed_at,
        text:`spot ${mark.spot} of 200 on the road to the cybertruck 🛻 every spot = a name on the truck. 21+ | not a guarantee`,
        first_reply:'get your link here (21+): https://kobesbettinghub.com/refer\nfree discord: https://discord.gg/sB9vzGz2xj'};
      results.push({id:item.id,...await processItem(env,item,record,{fetchImpl})});
    }
  }
  return { status: 'completed', posted: results.filter(row => row.status === 'posted').length, expired: expired.length, results };
}
async function postWinNudge(rows, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  if (!enabled(env,now) || !env.ROAD_TO_TRUCK_SECRET || !env.TRUCK_PUBLISHER_URL || !env.AUDIT_CHANNEL_ID) return { status: 'disabled' };
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
module.exports = { run, postWinNudge, paidLeaderboard, enabled, processItem, postDaily, sendDiscord, sendX, show, target };
