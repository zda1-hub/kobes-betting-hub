const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { WELCOME_MESSAGE } = require('../../data/member-welcome.json');
const { vipRoleIds } = require('./welcome');

const FREE_ROLE_NAME = 'Free';
const START_CHANNEL_NAME = 'start-here';
const MENTION_NAMES = ['free-picks', 'results', 'general'];
const MENTION_CHANNEL_SUFFIX = { 'free-picks': 'free-picks', results: 'results', general: 'community-chat' };
const BOT_ALLOW = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseApplicationCommands
];

function hasVip(member, ids = vipRoleIds()) {
  return [...ids].some(id => member.roles.cache.has(id));
}

function freeRole(guild) {
  const matches = guild.roles.cache.filter(role => role.name === FREE_ROLE_NAME);
  if (matches.size > 1) throw new Error('Multiple Free roles exist; select one manually before setup.');
  return matches.first() || null;
}

function startChannel(guild) {
  const matches = guild.channels.cache.filter(channel => channel.name === START_CHANNEL_NAME && channel.type === ChannelType.GuildText);
  if (matches.size > 1) throw new Error('Multiple #start-here text channels exist; select one manually before setup.');
  return matches.first() || null;
}

function resolveWelcomeMessage(guild, template = WELCOME_MESSAGE) {
  const missing = [];
  let content = template;
  for (const name of MENTION_NAMES) {
    const suffix = MENTION_CHANNEL_SUFFIX[name];
    const matches = guild.channels.cache.filter(channel =>
      channel.type === ChannelType.GuildText &&
      (channel.name === suffix || channel.name.endsWith(`・${suffix}`)));
    if (matches.size !== 1) { missing.push(name); continue; }
    content = content.replaceAll(`#${name}`, `<#${matches.first().id}>`);
  }
  if (missing.length) throw new Error(`Missing or ambiguous channels: ${missing.map(name => '#' + name).join(', ')}. No channel was created.`);
  if (content.length > 2000) throw new Error('WELCOME_MESSAGE exceeds Discord’s 2000-character limit.');
  return content;
}

function welcomeOverwrites(guild, role, botRole) {
  return [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: botRole.id, allow: BOT_ALLOW }
  ];
}

async function inspectWelcome(guild, { vipIds = vipRoleIds(), botId = guild.client.user.id } = {}) {
  await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.members.fetch()]);
  const role = freeRole(guild);
  const channel = startChannel(guild);
  const bot = guild.members.cache.get(botId) || await guild.members.fetch(botId);
  if (!bot) throw new Error('Bot member was not found in the guild.');
  const botRole = bot.roles.highest;
  if (!botRole || botRole.id === guild.id) throw new Error('Bot has no managed role for channel permissions.');
  if (role && botRole.position <= role.position && !bot.permissions.has(PermissionFlagsBits.Administrator))
    throw new Error('Bot role must be above Free to manage it.');
  const members = [...guild.members.cache.values()].filter(member => !member.user.bot);
  const toAdd = members.filter(member => !hasVip(member, vipIds) && (!role || !member.roles.cache.has(role.id)));
  const toRemove = role ? members.filter(member => hasVip(member, vipIds) && member.roles.cache.has(role.id)) : [];
  const pins = channel ? await channel.messages.fetchPinned() : null;
  const pinnedBotMessages = pins ? [...pins.values()].filter(message => message.author.id === botId) : [];
  if (pinnedBotMessages.length > 1) throw new Error('Multiple bot pins exist in #start-here; review before setup.');
  let content = null; let blocked = null;
  try { content = resolveWelcomeMessage(guild); }
  catch (error) { blocked = error.message; }
  return { guild, role, channel, botRole, content, membersScanned: members.length, toAdd, toRemove,
    pinnedMessage: pinnedBotMessages[0] || null,
    planned: {
      role: role ? `reuse ${role.id}` : 'create Free',
      channel: channel ? `reuse ${channel.id}` : 'create #start-here at top level',
      permissions: '@everyone deny ViewChannel; Free allow ViewChannel + ReadMessageHistory, deny SendMessages; bot allow channel management and messaging',
      pin: pinnedBotMessages.length ? `edit pinned bot message ${pinnedBotMessages[0].id}` : 'post and pin one bot message',
      backfillAdd: toAdd.length, vipFreeRemove: toRemove.length,
      membersScanned: members.length, blocked, mentions: MENTION_NAMES.map(name => {
        const suffix = MENTION_CHANNEL_SUFFIX[name];
        return { placeholder: `#${name}`, matches: [...guild.channels.cache.values()]
          .filter(c => c.type === ChannelType.GuildText && (c.name === suffix || c.name.endsWith(`・${suffix}`)))
          .map(c => ({ id: c.id, name: c.name })) };
      })
    } };
}

async function applyWelcome(plan) {
  if (!plan.content) throw new Error(plan.planned.blocked || 'Welcome setup is blocked by unresolved channel mentions.');
  let { guild, role, channel } = plan;
  role ||= await guild.roles.create({ name: FREE_ROLE_NAME, reason: 'KBH free-member welcome channel' });
  const overwrites = welcomeOverwrites(guild, role, plan.botRole);
  if (!channel) {
    channel = await guild.channels.create({ name: START_CHANNEL_NAME, type: ChannelType.GuildText,
      position: 0, permissionOverwrites: overwrites, reason: 'KBH free-member welcome' });
  } else {
    // Replace stale role allows so a reused channel cannot leak to VIP or other roles.
    await channel.permissionOverwrites.set(overwrites, 'KBH Free-only welcome channel');
    if (channel.parentId) await channel.setParent(null, { lockPermissions: false });
    if (channel.position !== 0) await channel.setPosition(0);
  }
  // Remove Free from VIPs before posting; a stale Free role can override @everyone denial.
  for (const member of plan.toRemove) await member.roles.remove(role, 'KBH VIP access active');
  let added = 0;
  for (const member of plan.toAdd) { await member.roles.add(role, 'KBH free-member backfill'); added++; }
  let pinned = plan.pinnedMessage;
  if (pinned) await pinned.edit({ content: plan.content, allowedMentions: { parse: [] } });
  else {
    pinned = await channel.send({ content: plan.content, allowedMentions: { parse: [] } });
    await pinned.pin();
  }
  console.log(`KBH free-role backfill: ${added} members; VIP Free roles removed: ${plan.toRemove.length}`);
  return { channelId: channel.id, messageId: pinned.id, added };
}

async function syncFreeRole(member, { enabled = false, vipIds = vipRoleIds() } = {}) {
  if (!enabled || member.user.bot) return 'disabled';
  const role = freeRole(member.guild);
  if (!role) return 'setup-required';
  if (hasVip(member, vipIds)) {
    if (member.roles.cache.has(role.id)) { await member.roles.remove(role, 'KBH VIP access active'); return 'removed'; }
    return 'vip';
  }
  if (!member.roles.cache.has(role.id)) { await member.roles.add(role, 'KBH free-member access'); return 'added'; }
  return 'free';
}

async function refreshPinnedWelcome(guild) {
  const plan = await inspectWelcome(guild);
  if (!plan.content) throw new Error(plan.planned.blocked || 'Welcome text is not ready.');
  if (!plan.channel || !plan.pinnedMessage) throw new Error('Run approved welcome setup before refreshing the pin.');
  await plan.pinnedMessage.edit({ content: plan.content, allowedMentions: { parse: [] } });
  return { channelId: plan.channel.id, messageId: plan.pinnedMessage.id };
}

module.exports = { FREE_ROLE_NAME, START_CHANNEL_NAME, resolveWelcomeMessage, welcomeOverwrites,
  inspectWelcome, applyWelcome, syncFreeRole, refreshPinnedWelcome, hasVip };
