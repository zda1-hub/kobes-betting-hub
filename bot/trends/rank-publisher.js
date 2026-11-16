'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { AttachmentBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { rankImages } = require('./rank-image');
const { NBA_METRICS, NFL_OFFENSE, NFL_DEFENSE, NBA_POSITION, NFL_POSITION } = require('./team-ranks');
const { refresh } = require('./rank-snapshot');
const { serviceDate } = require('./bulk-panel');

const CATEGORIES = Object.freeze({ NBA: '📊・NBA TEAM RANKS', NFL: '🏈・NFL TEAM RANKS' });
const SECTIONS = Object.freeze({ offense: 'offense-ranks', defense: 'defense-ranks',
  position: 'vs-position-ranks' });
function verifiedPrivate(channel, guild, vipIds) {
  return channel?.guildId === guild.id && channel.isTextBased() &&
    channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) === false &&
    vipIds.every(id => channel.permissionsFor(guild.roles.cache.get(id))?.has(PermissionFlagsBits.ViewChannel) === true);
}
async function ensureChannels(client, guildId, vipIds) {
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  for (const id of vipIds) if (!guild.roles.cache.has(id)) throw new Error(`VIP role ${id} missing; rank channels held`);
  const result = {};
  for (const sport of ['NBA', 'NFL']) {
    let category = guild.channels.cache.find(row => row.name === CATEGORIES[sport] &&
      row.type === ChannelType.GuildCategory);
    if (!category) category = await guild.channels.create({ name: CATEGORIES[sport],
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...vipIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel] })),
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }
      ], reason: 'KBH requested VIP team-rank sheets' });
    result[sport] = {};
    for (const [section, name] of Object.entries(SECTIONS)) {
      let channel = guild.channels.cache.find(row => row.name === name && row.parentId === category.id);
      if (!channel) channel = await guild.channels.create({ name, type: ChannelType.GuildText,
        parent: category.id, permissionOverwrites: category.permissionOverwrites.cache.map(row => ({
          id: row.id, allow: row.allow.bitfield, deny: row.deny.bitfield })),
        reason: 'KBH requested VIP team-rank sheets' });
      if (!verifiedPrivate(channel, guild, vipIds))
        throw new Error(`${sport} ${section} rank channel is not verified VIP-only`);
      result[sport][section] = channel;
    }
  }
  return result;
}
function metricCatalog(sport, section) {
  if (sport === 'NBA') return section === 'position' ? NBA_POSITION :
    section === 'defense' ? { ...NBA_METRICS, turnovers_forced: 'Turnovers forced' } : NBA_METRICS;
  return section === 'offense' ? NFL_OFFENSE : section === 'defense' ? NFL_DEFENSE : NFL_POSITION;
}
function rowsForSection(sheet, section) {
  if (section !== 'position') return Object.entries(sheet[section]).map(([metric, rows]) =>
    ({ label: metricCatalog(sheet.sport, section)[metric] || metric, rows }));
  return Object.entries(sheet.position).flatMap(([position, metrics]) =>
    Object.entries(metrics).map(([metric, rows]) => ({
      label: `${position} ${metricCatalog(sheet.sport, section)[metric] || metric}`, rows })));
}
function publicationFile(root, sport, section, date) {
  return path.join(root, 'trends', 'team-ranks', `published-${sport}-${section}-${date}.json`);
}
async function publishSection({ root, sheet, section, channel, updatedAt,
  guildId, vipIds }) {
  if (!verifiedPrivate(channel, channel.guild, vipIds)) throw new Error('Rank destination is not VIP-only');
  const date = serviceDate(new Date(sheet.updatedAt));
  const receiptFile = publicationFile(root, sheet.sport, section, date);
  try { return { ...(JSON.parse(await fs.readFile(receiptFile, 'utf8'))), existing: true }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const previous = path.join(root, 'trends', 'team-ranks', `latest-${sheet.sport}-${section}.json`);
  let old = null;
  try { old = JSON.parse(await fs.readFile(previous, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const messages = [];
  try {
    const unavailable = [];
    let batch = [];
    let batchMetrics = [];
    const flush = async () => {
      if (!batch.length) return;
      messages.push(await channel.send({ content:
        `**${sheet.sport} ${section} rank sheets** · ${batchMetrics.join(', ')}` +
        (sheet.sport === 'NFL' ? '\nData: nflverse (CC BY 4.0)' : '') +
        '\n21+ | Research only, not a guarantee',
      files: batch, allowedMentions: { parse: [] } }));
      batch = []; batchMetrics = [];
    };
    for (const item of rowsForSection(sheet, section)) {
      if (!item.rows.some(row => Number.isFinite(row.average))) {
        unavailable.push(item.label); continue;
      }
      const images = await rankImages({ sport: sheet.sport,
        section: section === 'position' ? 'Vs position' : section === 'offense' ? 'Offense' : 'Defense',
        metric: item.label, rows: item.rows, updatedAt, dataDate: sheet.dataDate });
      const attachments = images.map((buffer, index) => new AttachmentBuilder(buffer,
        { name: `${sheet.sport.toLowerCase()}-${section}-${item.label.replace(/[^a-z0-9]+/gi, '-')}-${index + 1}.png` }));
      if (batch.length + attachments.length > 10) await flush();
      batch.push(...attachments);
      batchMetrics.push(item.label);
    }
    await flush();
    if (unavailable.length) messages.push(await channel.send({ content:
      `**${sheet.sport} ${section} · N/A from this source:** ${unavailable.join(', ')}. ` +
      'No position or statistic was inferred from a broader label.\n' +
      '21+ | Research only, not a guarantee', allowedMentions: { parse: [] } }));
    if (!messages.length) messages.push(await channel.send({ content:
      `**${sheet.sport} ${section}** · N/A. The current source does not support reliable position-specific ranks.\n` +
      '21+ | Research only, not a guarantee' }));
    const receipt = { sport: sheet.sport, section, date, channelId: channel.id,
      guildId, messageIds: messages.map(row => row.id), dataDate: sheet.dataDate,
      updatedAt: sheet.updatedAt };
    await fs.mkdir(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
    const temp = `${receiptFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(receipt), { mode: 0o600 });
    await fs.rename(temp, receiptFile);
    await fs.writeFile(previous, JSON.stringify(receipt), { mode: 0o600 });
    if (old?.channelId === channel.id) for (const id of old.messageIds || [])
      await channel.messages.delete(id).catch(error => console.warn('Old rank post could not be replaced:', error.message));
    return receipt;
  } catch (error) {
    for (const message of messages) await message.delete().catch(() => {});
    throw error;
  }
}
async function updateTuesday({ client, guildId, vipIds, root, bdlKey, now = new Date() }) {
  const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = local.find(part => part.type === 'weekday')?.value;
  const hour = Number(local.find(part => part.type === 'hour')?.value);
  if (weekday !== 'Tue' || hour !== 10) return { status: 'waiting' };
  const channels = await ensureChannels(client, guildId, vipIds);
  const updatedAt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    dateStyle: 'medium', timeStyle: 'short' }).format(now) + ' PT';
  const receipts = [];
  for (const sport of ['NBA', 'NFL']) {
    const { sheet } = await refresh({ root, sport, bdlKey, now });
    for (const section of Object.keys(SECTIONS)) receipts.push(await publishSection({
      root, sheet, section, channel: channels[sport][section], updatedAt,
      guildId, vipIds }));
  }
  return { status: 'updated', receipts };
}

module.exports = { CATEGORIES, SECTIONS, verifiedPrivate, ensureChannels,
  rowsForSection, updateTuesday, publishSection };
