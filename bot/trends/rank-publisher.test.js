'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');
const { publishSection } = require('./rank-publisher');

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
