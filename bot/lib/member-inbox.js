'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

function fileFor(root) { return path.join(root, 'member-inbox', 'threads.json'); }
async function read(root) {
  try {
    const data = JSON.parse(await fs.readFile(fileFor(root), 'utf8'));
    if (data.version !== 1 || !data.members || typeof data.members !== 'object') throw new Error('Invalid inbox state');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, members: {} };
    throw error;
  }
}
async function write(root, data) {
  const target = fileFor(root);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
  await fs.rename(temp, target);
}
function configured(env) {
  return /^\d{17,20}$/.test(env.KOBE_INBOX_CHANNEL_ID || '') &&
    /^\d{17,20}$/.test(env.KOBE_USER_ID || '') &&
    /^\d{17,20}$/.test(env.DISCORD_GUILD_ID || '');
}
async function verifiedInbox(client, env) {
  const inbox = await client.channels.fetch(env.KOBE_INBOX_CHANNEL_ID);
  if (!inbox || inbox.guildId !== env.DISCORD_GUILD_ID || inbox.name !== 'kobe-inbox' ||
      inbox.type !== ChannelType.GuildText ||
      inbox.permissionsFor(inbox.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) !== false ||
      inbox.permissionsFor(inbox.guild.members.me)?.has(PermissionFlagsBits.SendMessages) !== true ||
      inbox.permissionsFor(inbox.guild.members.me)?.has(PermissionFlagsBits.CreatePrivateThreads) !== true)
    throw new Error('kobe-inbox must be a verified staff-only text channel writable by Kobe Bot');
  const kobe = await inbox.guild.members.fetch(env.KOBE_USER_ID);
  if (!kobe || inbox.permissionsFor(kobe)?.has(PermissionFlagsBits.ViewChannel) !== true)
    throw new Error('Kobe does not have access to kobe-inbox');
  return inbox;
}

function cleanText(content) {
  return String(content || '').replace(/@everyone|@here/g, '[mention]').slice(0, 1750).trim();
}
async function relayMemberDm({ client, message, root, env = process.env }) {
  if (!configured(env) || message.author?.bot || message.channel?.type !== ChannelType.DM) return false;
  const memberId = message.author.id;
  const inbox = await verifiedInbox(client, env);
  // Only receive messages from current KBH members.
  try { await inbox.guild.members.fetch(memberId); }
  catch { return false; }
  const data = await read(root);
  let thread = data.members[memberId]?.threadId ?
    await client.channels.fetch(data.members[memberId].threadId).catch(() => null) : null;
  if (!thread) {
    thread = await inbox.threads.create({ name: `Member ${memberId}`,
      type: ChannelType.PrivateThread, autoArchiveDuration: 1440,
      reason: 'Private member reply to Kobe Bot welcome DM' });
    await thread.members.add(env.KOBE_USER_ID);
    data.members[memberId] = { threadId: thread.id, openedAt: new Date().toISOString() };
    await write(root, data);
  }
  if (thread.archived) await thread.setArchived(false);
  const text = cleanText(message.content);
  if (!text) return false;
  await thread.send({ content: `From <@${memberId}> via Kobe Bot DM:\n${text}`,
    allowedMentions: { users: [memberId] } });
  return true;
}
async function relayKobeReply({ client, message, root, env = process.env }) {
  if (!configured(env) || message.author?.id !== env.KOBE_USER_ID ||
      message.channel?.type !== ChannelType.PrivateThread) return false;
  const data = await read(root);
  const memberId = Object.entries(data.members).find(([, item]) => item.threadId === message.channelId)?.[0];
  if (!memberId) return false;
  const text = cleanText(message.content);
  if (!text) return false;
  const member = await client.users.fetch(memberId);
  try { await member.send({ content: `Kobe: ${text}`, allowedMentions: { parse: [] } }); }
  catch (error) {
    await message.channel.send({ content: `Delivery to member ${memberId} failed; their DMs may be closed.`,
      allowedMentions: { parse: [] } });
    throw error;
  }
  return true;
}

module.exports = { configured, cleanText, read, relayMemberDm, relayKobeReply, verifiedInbox };
