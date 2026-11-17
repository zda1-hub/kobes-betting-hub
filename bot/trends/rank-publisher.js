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
const POSITION_CATALOG_VERSION = 1;
const NBA_POSITION_SHEET_STATS = Object.freeze({
  PG: Object.keys(NBA_POSITION).filter(metric => metric !== 'blk'),
  SG: Object.keys(NBA_POSITION).filter(metric => metric !== 'blk'),
  SF: Object.keys(NBA_POSITION),
  PF: Object.keys(NBA_POSITION),
  C: Object.keys(NBA_POSITION)
});
const NFL_POSITION_SHEET_STATS = Object.freeze({
  QB: ['passing_yards', 'passing_tds', 'rushing_yards', 'anytime_touchdown'],
  RB: ['rushing_yards', 'receptions', 'receiving_yards', 'receiving_tds',
    'targets', 'rush_receiving_yards', 'anytime_touchdown'],
  WR: ['receptions', 'receiving_yards', 'receiving_tds', 'targets',
    'rushing_yards', 'rush_receiving_yards', 'anytime_touchdown'],
  TE: ['receptions', 'receiving_yards', 'receiving_tds', 'targets', 'anytime_touchdown'],
  K: ['fg_made', 'pat_made']
});
function verifiedPrivate(channel, guild, vipIds) {
  return channel?.guildId === guild.id && channel.isTextBased() &&
    channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel) === false &&
    vipIds.every(id => channel.permissionsFor(guild.roles.cache.get(id))?.has(PermissionFlagsBits.ViewChannel) === true);
}
async function preferredChannels(root, sport) {
  const ids = {};
  if (!root) return ids;
  for (const section of Object.keys(SECTIONS)) {
    try {
      const receipt = JSON.parse(await fs.readFile(path.join(root, 'trends', 'team-ranks',
        `latest-${sport}-${section}.json`), 'utf8'));
      if (receipt.sport === sport && receipt.section === section && receipt.channelId)
        ids[section] = receipt.channelId;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return ids;
}
async function ensureChannels(client, guildId, vipIds, root = null) {
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  for (const id of vipIds) if (!guild.roles.cache.has(id)) throw new Error(`VIP role ${id} missing; rank channels held`);
  const result = {};
  for (const sport of ['NBA', 'NFL']) {
    const preferred = await preferredChannels(root, sport);
    const categories = [...guild.channels.cache.values()].filter(row =>
      row.name === CATEGORIES[sport] && row.type === ChannelType.GuildCategory)
      .sort((a, b) => a.id.localeCompare(b.id));
    let category = categories.find(row => Object.values(preferred).some(id =>
      guild.channels.cache.get(id)?.parentId === row.id)) || categories[0];
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
      const candidates = [...guild.channels.cache.values()].filter(row =>
        row.name === name && row.parentId === category.id)
        .sort((a, b) => a.id.localeCompare(b.id));
      let channel = candidates.find(row => row.id === preferred[section] &&
        verifiedPrivate(row, guild, vipIds)) ||
        candidates.find(row => verifiedPrivate(row, guild, vipIds)) || candidates[0];
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
    Object.entries(metrics).filter(([metric]) => (sheet.sport === 'NFL' ?
      NFL_POSITION_SHEET_STATS : NBA_POSITION_SHEET_STATS)[position]?.includes(metric))
      .map(([metric, rows]) => ({
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
  try {
    const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
    if (section !== 'position' || receipt.positionCatalogVersion === POSITION_CATALOG_VERSION)
      return { ...receipt, existing: true };
  }
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
        '\nResearch only, not a guarantee',
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
      'Research only, not a guarantee', allowedMentions: { parse: [] } }));
    if (!messages.length) messages.push(await channel.send({ content:
      `**${sheet.sport} ${section}** · N/A. The current source does not support reliable position-specific ranks.\n` +
      'Research only, not a guarantee' }));
    const receipt = { sport: sheet.sport, section, date, channelId: channel.id,
      guildId, messageIds: messages.map(row => row.id), dataDate: sheet.dataDate,
      updatedAt: sheet.updatedAt,
      ...(section === 'position' ? { positionCatalogVersion: POSITION_CATALOG_VERSION } : {}) };
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
function rankWindowOpen(now = new Date()) {
  const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = local.find(part => part.type === 'weekday')?.value;
  const hour = Number(local.find(part => part.type === 'hour')?.value);
  // If a permissions or provider failure blocks 10 AM, retry later Tuesday.
  // Publication receipts still prevent duplicate sheets after a successful run.
  return weekday === 'Tue' && hour >= 10;
}
async function updateTuesday({ client, guildId, vipIds, root, bdlKey, now = new Date() }) {
  if (!rankWindowOpen(now)) return { status: 'waiting' };
  const channels = await ensureChannels(client, guildId, vipIds, root);
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

module.exports = { CATEGORIES, SECTIONS, NBA_POSITION_SHEET_STATS, NFL_POSITION_SHEET_STATS,
  verifiedPrivate, ensureChannels,
  rowsForSection, rankWindowOpen, updateTuesday, publishSection };
