'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { publishSection, rankWindowOpen, rowsForSection, ensureChannels,
  CATEGORIES, SECTIONS } = require('./rank-publisher');

test('position sheets omit stats that do not fit the position', () => {
  const rows = [{ team: 'BUF', average: 3, rank: 1, games: 10 }];
  const nfl = { sport: 'NFL', position: {
    QB: { passing_yards: rows, receiving_yards: rows },
    RB: { passing_yards: rows, rushing_yards: rows, receptions: rows },
    K: { passing_yards: rows, fg_made: rows, pat_made: rows }
  } };
  const labels = rowsForSection(nfl, 'position').map(row => row.label);
  assert.deepEqual(labels, ['QB Pass yds', 'RB Rush yds', 'RB Receptions', 'K FG', 'K XP']);
  const nba = { sport: 'NBA', position: { PG: { pts: rows, blk: rows },
    C: { pts: rows, blk: rows } } };
  assert.deepEqual(rowsForSection(nba, 'position').map(row => row.label),
    ['PG PTS', 'C PTS', 'C BLK']);
});

test('rank channel lookup reuses published channels amid empty duplicates', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-rank-channels-'));
  const directory = path.join(root, 'trends', 'team-ranks');
  await fs.mkdir(directory, { recursive: true });
  const role = { id: 'vip' }, everyone = { id: 'everyone' };
  const cache = new Map();
  const category = (id, sport) => ({ id, name: CATEGORIES[sport], type: ChannelType.GuildCategory });
  const channel = (id, parentId, name) => ({ id, parentId, name, guildId: 'guild',
    isTextBased: () => true,
    permissionsFor: subject => ({ has: bit => bit === PermissionFlagsBits.ViewChannel &&
      subject?.id === 'vip' }) });
  for (const row of [category('1', 'NBA'), category('2', 'NBA'), category('3', 'NFL')])
    cache.set(row.id, row);
  for (const sport of ['NBA', 'NFL']) for (const [section, name] of Object.entries(SECTIONS)) {
    const parentId = sport === 'NBA' ? '1' : '3';
    const preferredId = `${sport}-${section}-live`;
    cache.set(preferredId, channel(preferredId, parentId, name));
    cache.set(`${sport}-${section}-empty`, channel(`${sport}-${section}-empty`, parentId, name));
    await fs.writeFile(path.join(directory, `latest-${sport}-${section}.json`),
      JSON.stringify({ sport, section, channelId: preferredId }));
  }
  for (const [section, name] of Object.entries(SECTIONS))
    cache.set(`NBA-${section}-other`, channel(`NBA-${section}-other`, '2', name));
  const guild = { id: 'guild', roles: { everyone, cache: new Map([['vip', role]]) },
    channels: { cache, fetch: async () => {}, create: async () => { throw Error('created duplicate'); } } };
  const client = { guilds: { fetch: async () => guild } };
  try {
    const result = await ensureChannels(client, 'guild', ['vip'], root);
    assert.equal(result.NBA.position.id, 'NBA-position-live');
    assert.equal(result.NFL.defense.id, 'NFL-defense-live');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Tuesday rank refresh catches up after 10 AM Pacific but not before', () => {
  assert.equal(rankWindowOpen(new Date('2026-11-17T17:59:00Z')), false);
  assert.equal(rankWindowOpen(new Date('2026-11-17T18:00:00Z')), true);
  assert.equal(rankWindowOpen(new Date('2026-11-17T19:45:00Z')), true);
  assert.equal(rankWindowOpen(new Date('2026-11-18T18:00:00Z')), false);
});

test('Tuesday sheets batch mobile images within Discord attachment limits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-ranks-'));
  const sent = [];
  const role = { id: 'vip' };
  const guild = { id: 'guild', roles: { everyone: { id: 'everyone' },
    cache: new Map([['vip', role]]) } };
  const channel = { id: 'channel', guildId: 'guild', guild,
    isTextBased: () => true,
    permissionsFor: subject => ({ has: bit => bit === PermissionFlagsBits.ViewChannel &&
      subject?.id === 'vip' }),
    send: async payload => { sent.push(payload); return { id: String(sent.length), delete: async () => {} }; } };
  const rows = [{ team: 'BUF', average: 24.5, rank: 1, games: 10 }];
  const sheet = { sport: 'NFL', updatedAt: '2026-11-17T18:00:00Z',
    dataDate: '2026-11-15', offense: Object.fromEntries(Array.from({ length: 12 }, (_, i) =>
      [`metric_${i}`, rows])) };
  try {
    const result = await publishSection({ root, sheet, section: 'offense', channel,
      guildId: 'guild', vipIds: ['vip'], updatedAt: 'Nov 17, 2026, 10:00 AM PT' });
    assert.equal(result.messageIds.length, 2);
    assert.deepEqual(sent.map(row => row.files.length), [10, 2]);
    assert.ok(sent.every(row => row.content.includes('Data: nflverse (CC BY 4.0)')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('same-day position sheet replaces the old unfiltered post once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-position-ranks-'));
  const directory = path.join(root, 'trends', 'team-ranks');
  await fs.mkdir(directory, { recursive: true });
  const old = { sport: 'NFL', section: 'position', date: '2026-11-17',
    channelId: 'channel', messageIds: ['old'] };
  await fs.writeFile(path.join(directory, 'published-NFL-position-2026-11-17.json'), JSON.stringify(old));
  await fs.writeFile(path.join(directory, 'latest-NFL-position.json'), JSON.stringify(old));
  const sent = [], deleted = [];
  const role = { id: 'vip' };
  const guild = { id: 'guild', roles: { everyone: { id: 'everyone' },
    cache: new Map([['vip', role]]) } };
  const channel = { id: 'channel', guildId: 'guild', guild, isTextBased: () => true,
    permissionsFor: subject => ({ has: bit => bit === PermissionFlagsBits.ViewChannel &&
      subject?.id === 'vip' }),
    send: async payload => { sent.push(payload); return { id: 'new', delete: async () => {} }; },
    messages: { delete: async id => { deleted.push(id); } } };
  const rows = [{ team: 'BUF', average: 3, rank: 1, games: 10 }];
  const sheet = { sport: 'NFL', updatedAt: '2026-11-17T18:00:00Z',
    dataDate: '2026-11-15', position: { RB: { passing_yards: rows,
      rushing_yards: rows } } };
  try {
    const result = await publishSection({ root, sheet, section: 'position', channel,
      guildId: 'guild', vipIds: ['vip'], updatedAt: 'Nov 17, 2026, 10:00 AM PT' });
    assert.equal(result.positionCatalogVersion, 1);
    assert.deepEqual(deleted, ['old']);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /RB Rush yds/);
    assert.doesNotMatch(sent[0].content, /RB Pass yds/);
    const again = await publishSection({ root, sheet, section: 'position', channel,
      guildId: 'guild', vipIds: ['vip'], updatedAt: 'Nov 17, 2026, 10:00 AM PT' });
    assert.equal(again.existing, true);
    assert.equal(sent.length, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
