'use strict';
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const CATEGORY = '🛻 ROAD TO THE TRUCK';
const ROLES = [
  {name:'Rider',color:0x9AA0A6}, {name:'Road Crew',color:0xF5A623},
  {name:'Door Squad',color:0xE74C3C}, {name:'Hood Club',color:0xFFD700},
];
const CHANNELS = [
  {name:'how-to-get-on-the-truck',public:true,readOnly:true},
  {name:'truck-wall',public:true,readOnly:true},
  {name:'road-crew',allowed:['Road Crew','Door Squad','Hood Club']},
  {name:'hood-club',allowed:['Hood Club']},
];
const live = env => env.NAME_WALL_ENABLED === 'true';
const apiBase = env => String(env.TRUCK_PUBLISHER_URL || '').replace(/\/$/,'')+'/api/admin/truck/';
async function api(env,action,body,fetchImpl=fetch) {
  const response=await fetchImpl(apiBase(env)+action,{method:body?'POST':'GET',
    headers:{authorization:`Bearer ${env.ROAD_TO_TRUCK_SECRET}`,...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if (!response.ok) throw new Error(result.error || `Truck API ${response.status}`);
  return result;
}
function permissionReport(guild,env=process.env) {
  const me=guild.members.me;
  const staffIds=(env.TRUCK_STAFF_ROLE_IDS||'').split(',').filter(Boolean);
  const staffRoles=[...new Map([...staffIds.map(id=>guild.roles.cache.get(id)).filter(Boolean),
    ...(guild.roles.cache.filter?.(r=>!r.managed&&r.id!==guild.id&&r.permissions.has(PermissionFlagsBits.Administrator))?.values()||[])]
    .map(role=>[role.id,role])).values()];
  const vipRoles=(env.VIP_ACCESS_ROLE_IDS||'1539063967878619218,1542668360985088070').split(',').map(id=>guild.roles.cache.get(id)).filter(Boolean);
  const ceiling=Math.min(me?.roles.highest.position ?? 0,...[...staffRoles,...vipRoles].map(r=>r.position));
  const unmanageableTruckRoles=ROLES.filter(spec=>{
    const role=guild.roles.cache.find(r=>r.name===spec.name);
    return role&&role.position>=(me?.roles.highest.position??0);
  }).map(spec=>spec.name);
  return {manageRoles:Boolean(me?.permissions.has(PermissionFlagsBits.ManageRoles)),
    manageChannels:Boolean(me?.permissions.has(PermissionFlagsBits.ManageChannels)),
    manageMessages:Boolean(me?.permissions.has(PermissionFlagsBits.ManageMessages)),
    botRolePosition:me?.roles.highest.position ?? null,placementCeiling:ceiling,
    canPlaceFourRoles:(me?.roles.highest.position??0)>0 && unmanageableTruckRoles.length===0,
    unmanageableTruckRoles};
}
function plan(guild) {
  const category=guild.channels.cache.find(c=>c.name===CATEGORY&&c.type===ChannelType.GuildCategory);
  const report=permissionReport(guild);
  return {enabled:false,writes:0,permissions:report,
    roles:ROLES.map((role,index)=>({name:role.name,action:guild.roles.cache.find(r=>r.name===role.name)?'update color, hoist, order':'create',color:'#'+role.color.toString(16).toUpperCase(),hoisted:true,mentionable:false,order:index+1,placement:'below bot and staff/VIP roles'})),
    category:{name:CATEGORY,action:category?'reuse':'create',visibility:'everyone'},
    channels:CHANNELS.map(c=>({name:c.name,action:guild.channels.cache.find(x=>x.name===c.name&&x.parentId===category?.id)?'reuse and reconcile permissions':'create',visibility:c.public?'everyone':c.allowed.join(', '),send:c.readOnly?'bot/staff only':'permitted roles',overwrites:c.public
      ?{'@everyone':['allow ViewChannel','allow ReadMessageHistory','deny SendMessages'],'bot':['allow ViewChannel','allow SendMessages','allow ManageMessages'],'staff':['allow ViewChannel','allow SendMessages','allow ReadMessageHistory']}
      :{'@everyone':['deny ViewChannel'],'bot':['allow ViewChannel','allow SendMessages','allow ManageMessages'],'staff':['allow ViewChannel','allow SendMessages','allow ReadMessageHistory'],[c.allowed.join('/')]:['allow ViewChannel','allow SendMessages','allow ReadMessageHistory']}})),
    explainer:explainer(0),announcement:announcement(null,0)};
}
function explainer(spot,channelIds={}) {
  const mention=(name)=>channelIds[name]?`<#${channelIds[name]}>`:'#'+name;
  const {referralRewardLine}=require('../../content/truck_config.json');
  // Attribution for Musk's updated timeline, not a KBH production guarantee:
  // https://x.com/elonmusk/status/2120565056429814073
  return new EmbedBuilder().setColor(0xff7a1a).setTitle('🛻 ROAD TO THE CYBERTRUCK')
    .setDescription([
      "we're getting a cybertruck and putting YOUR name on it. elon says cybertruck production ends summer 2027, so the clock is real. every spot on the truck is earned.",
      '**HOW TO GET YOUR NAME ON IT**',
      '1. be in this server 7+ days (free access counts)',
      '2. grab your link → kobesbettinghub.com/refer',
      '3. send it to people who actually bet props',
      '4. when they join VIP and stay past their first month, you level up',
      referralRewardLine,
      '**THE TIERS**',
      '🟤 1 referral → Rider: your name on the wall + a sticker spot on the truck',
      `🟠 3 referrals → Road Crew: bigger name, Road Crew role, access to ${mention('road-crew')} (road crew chat + truck updates + shoutouts)`,
      '🔴 10 referrals → Door Squad: big name on the truck door section + shoutout',
      `🟡 25 referrals → Hood Club: biggest name on the hood/tailgate. only 10 spots ever. first come first served. access to ${mention('hood-club')}`,
      '**COMMANDS**',
      '/mytier: see your count + how many to next tier',
      '/wallname <name>: set the name that goes on the truck (once, 20 chars, keep it clean)',
      '/wallhide /wallshow: hide or show your name publicly',
      '**PROGRESS**',
      `live wall → kobesbettinghub.com/truck\nwe're at spot ${spot} of 200. every new paid VIP after launch moves the bar.`,
      '**RULES**',
      '- only real paid VIP referrals count. trials don\'t. cancels/refunds before month 2 come off your count.',
      '- no self-referrals, no alt accounts. suspicious activity goes to staff review.',
      '- US 21+ only.',
      '21+ | not a guarantee | referral rewards paid per program terms',
    ].join('\n')).setFooter({text:'KBH truck wall explainer • managed by Kobe Bot'});
}
function announcement(channelId,spot=0) {
  // https://x.com/elonmusk/status/2120565056429814073
  const {referralRewardLine}=require('../../content/truck_config.json');
  return `🛻 road to the cybertruck is LIVE. elon says production ends summer 2027, so we're moving now. refer people to VIP, get your name on the truck.\n\n${referralRewardLine}\n\ntiers, rules and your link → ${channelId?`<#${channelId}>`:'#how-to-get-on-the-truck'}. ${spot===0?'we start at':'we are at'} spot ${spot} of 200. 21+ | not a guarantee`;
}
async function setup(guild,{env=process.env,dryRun=true}={}) {
  const preview=plan(guild);
  if (dryRun) return preview;
  if (!live(env)) throw new Error('NAME_WALL_ENABLED must be true before live setup.');
  if (!preview.permissions.manageRoles || !preview.permissions.manageChannels || !preview.permissions.manageMessages || !preview.permissions.canPlaceFourRoles)
    throw new Error(`Kobe Bot needs Manage Roles, Manage Channels, Manage Messages, and control of all existing truck roles. Existing roles at/above bot: ${preview.permissions.unmanageableTruckRoles.join(', ')||'none'}.`);
  const me=await guild.members.fetchMe();
  const staffIds=(env.TRUCK_STAFF_ROLE_IDS||'').split(',').filter(Boolean);
  const staffRoles=[...new Map([...staffIds.map(id=>guild.roles.cache.get(id)).filter(Boolean),
    ...guild.roles.cache.filter(r=>!r.managed&&r.permissions.has(PermissionFlagsBits.Administrator)).values()]
    .map(role=>[role.id,role])).values()].filter(r=>r.id!==guild.id);
  const vipRoles=(env.VIP_ACCESS_ROLE_IDS||'1539063967878619218,1542668360985088070').split(',').map(id=>guild.roles.cache.get(id)).filter(Boolean);
  const roleMap={};
  for (const spec of ROLES) {
    let role=guild.roles.cache.find(r=>r.name===spec.name);
    if (!role) role=await guild.roles.create({name:spec.name,color:spec.color,hoist:true,mentionable:false,reason:'KBH truck wall setup'});
    else if (role.color!==spec.color||!role.hoist||role.mentionable)
      await role.edit({color:spec.color,hoist:true,mentionable:false,reason:'KBH truck wall setup'});
    roleMap[spec.name]=role;
  }
  // Inserting roles at the bottom shifts existing role positions upward while
  // preserving their order. A low VIP role does not require four empty slots.
  for (let index=0;index<ROLES.length;index++) await roleMap[ROLES[index].name].setPosition(index+1);
  await guild.roles.fetch();
  const truckTop=Math.max(...ROLES.map(spec=>guild.roles.cache.get(roleMap[spec.name].id).position));
  const protectedBottom=Math.min(guild.roles.cache.get(me.roles.highest.id).position,
    ...[...staffRoles,...vipRoles].map(role=>guild.roles.cache.get(role.id).position));
  if (truckTop>=protectedBottom) throw new Error('Truck roles did not land below bot/staff/VIP roles; review the server role order.');
  let category=guild.channels.cache.find(c=>c.name===CATEGORY&&c.type===ChannelType.GuildCategory);
  if (!category) category=await guild.channels.create({name:CATEGORY,type:ChannelType.GuildCategory,reason:'KBH truck wall setup'});
  const channelMap={};
  const allStaff=staffRoles.map(r=>r.id);
  for (const spec of CHANNELS) {
    const overwrites=[{id:guild.id,allow:spec.public?[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]:[],
      deny:spec.public?[PermissionFlagsBits.SendMessages]:[PermissionFlagsBits.ViewChannel]},
      {id:me.roles.highest.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageMessages]}];
    for (const id of allStaff) overwrites.push({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
    for (const name of spec.allowed||[]) overwrites.push({id:roleMap[name].id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
    let channel=guild.channels.cache.find(c=>c.name===spec.name&&c.parentId===category.id&&c.type===ChannelType.GuildText);
    if (!channel) channel=await guild.channels.create({name:spec.name,type:ChannelType.GuildText,parent:category,permissionOverwrites:overwrites,reason:'KBH truck wall setup'});
    else await channel.permissionOverwrites.set(overwrites,'KBH truck wall access reconciliation');
    channelMap[spec.name]=channel;
  }
  const state=await api(env,'activate',{});
  const spot=state.active_paid_spots||0;
  const guide=channelMap['how-to-get-on-the-truck'];
  const pins=await guide.messages.fetchPinned();
  const existing=pins.find(m=>m.author.id===me.id&&m.embeds.some(e=>e.footer?.text?.startsWith('KBH truck wall explainer')));
  const payload={embeds:[explainer(spot,Object.fromEntries(Object.entries(channelMap).map(([name,c])=>[name,c.id])))],allowedMentions:{parse:[]}};
  if(existing) await existing.edit(payload); else {const sent=await guide.send(payload);await sent.pin();}
  const channelNamed=(name)=>guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&
    (c.name===name||c.name.endsWith(`・${name}`)));
  const announcements=channelNamed('announcements')||channelNamed('free-picks');
  if(!announcements) throw new Error('No announcements or free-picks channel found; announcement held.');
  const claim=await api(env,'receipt',{id:'truck:announcement',value:announcements.id});
  if(claim.claimed) {
    const sent=await announcements.send({content:announcement(guide.id,spot),allowedMentions:{parse:[]}});
    const admin=env.AUDIT_CHANNEL_ID?await guild.channels.fetch(env.AUDIT_CHANNEL_ID).catch(()=>null):null;
    if(admin) await admin.send({content:`Truck wall go-live announcement: ${sent.url}`,allowedMentions:{parse:[]}});
  }
  return {activated:true,categoryId:category.id,roles:Object.fromEntries(Object.entries(roleMap).map(([k,v])=>[k,v.id])),channels:Object.fromEntries(Object.entries(channelMap).map(([k,v])=>[k,v.id])),announcementChannelId:announcements.id};
}
function wallChannels(guild) {
  const category=guild.channels.cache.find(c=>c.name===CATEGORY&&c.type===ChannelType.GuildCategory);
  if(!category) return null;
  return Object.fromEntries(CHANNELS.map(spec=>[spec.name,guild.channels.cache.find(c=>c.name===spec.name&&c.parentId===category.id)]));
}
async function deliverPending(guild,{env=process.env}={}) {
  if(!live(env)) return {status:'disabled'};
  const channels=wallChannels(guild);
  if(!channels?.['truck-wall']||!channels?.['how-to-get-on-the-truck']) return {status:'not_setup'};
  const data=await api(env,'pending');
  const admin=env.AUDIT_CHANNEL_ID?await guild.channels.fetch(env.AUDIT_CHANNEL_ID).catch(()=>null):null;
  let delivered=0;
  for(const event of data.events||[]) {
    try {
      const member=await guild.members.fetch(event.user_id);
      const row=await api(env,'user',{userId:event.user_id,action:'get'});
      const min={'Rider':1,'Road Crew':3,'Door Squad':10,'Hood Club':25};
      for(const spec of ROLES) {
        const role=guild.roles.cache.find(r=>r.name===spec.name);
        if(!role) throw new Error(`Missing ${spec.name} role`);
        const shouldHave=(min[spec.name]||Infinity)<=row.count &&
          (spec.name!=='Hood Club'||row.tier==='Hood Club');
        if(shouldHave&&!member.roles.cache.has(role.id)) await member.roles.add(role,'KBH truck wall tier');
        if(!shouldHave&&member.roles.cache.has(role.id)) await member.roles.remove(role,'KBH truck wall tier demotion');
      }
      const state=await api(env,'state');
      const name=String(row.name||member.displayName||'Rider').replace(/[<>@\r\n]/g,'').slice(0,20);
      let wallLink=null;
      if(require('../../pipeline/truck-activation').enabled(env) && event.from_tier!==event.to_tier && event.to_tier!=='none' && (min[event.to_tier]||0)>(min[event.from_tier]||0)) {
        const first=event.to_tier==='Rider'&&
          (await api(env,'receipt',{id:'truck:first-rider',value:event.user_id})).claimed;
        const text=first
          ?`🛻 FIRST NAME ON THE TRUCK: ${name}. spot ${state.spot} of 200. you're next → kobesbettinghub.com/refer | 21+ not a guarantee`
          :`🛻 ${name} just hit ${event.to_tier} on the road to the truck. spot ${state.spot} of 200. get your name on it → kobesbettinghub.com/refer | 21+ not a guarantee`;
        wallLink=(await channels['truck-wall'].send({content:text,allowedMentions:{parse:[]}})).url;
        await member.send({content:`You reached ${event.to_tier} on the KBH truck wall. See what you unlocked in ${channels['how-to-get-on-the-truck'].url}. 21+ | not a guarantee`,allowedMentions:{parse:[]}})
          .catch(error=>console.warn('Truck tier DM closed:',event.user_id,error.message));
      }
      if(admin) await admin.send({content:`Truck tier change: ${event.user_id} ${event.from_tier} → ${event.to_tier}; reason: ${event.reason}${wallLink?`\nPost: ${wallLink}`:''}`,allowedMentions:{parse:[]}});
      await api(env,'ack',{eventId:event.id});
      delivered++;
    } catch(error) { console.error('Truck tier event held:',event.id,error.message); }
  }
  return {status:'checked',delivered};
}
async function refreshGuide(guild,{env=process.env,now=new Date()}={}) {
  if(!live(env)) return {status:'disabled'};
  const channels=wallChannels(guild);
  if(!channels?.['how-to-get-on-the-truck']) return {status:'not_setup'};
  const day=new Date(now.getTime()-7*3600000).toISOString().slice(0,10);
  const receiptId=`truck:guide:${day}`;
  const existingReceipt=await api(env,`receipt?id=${receiptId}`);
  if(existingReceipt.receipt) return {status:'already_checked'};
  const spot=(await api(env,'state')).spot;
  const guide=channels['how-to-get-on-the-truck'];
  const pins=await guide.messages.fetchPinned();
  const current=pins.find(m=>m.author.id===guild.members.me.id&&m.embeds.some(e=>e.footer?.text?.startsWith('KBH truck wall explainer')));
  if(!current) throw new Error('Pinned truck explainer missing');
  await current.edit({embeds:[explainer(spot,Object.fromEntries(Object.entries(channels).map(([name,c])=>[name,c?.id])))],allowedMentions:{parse:[]}});
  await api(env,'receipt',{id:receiptId,value:'daily refresh'});
  return {status:'updated',spot};
}
module.exports={CATEGORY,ROLES,CHANNELS,live,api,plan,setup,explainer,announcement,permissionReport,wallChannels,deliverPending,refreshGuide};
