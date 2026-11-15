'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { quoteStatus, refreshPublishedNbaTrends } = require('./nba-refresh');

const source = { sport: 'NBA', eventId: 'event-12345678',
  startsAt: '2026-11-15T20:00:00Z', player: 'Nikola Jokić', playerId: 1,
  market: 'player_points_alternate', side: 'over', line: 20.5,
  odds: -110, sportsbookKey: 'draftkings' };
const base = new Date('2026-11-15T19:40:00Z');

test('quote changes require matching book, line and normalized player', () => {
  assert.match(quoteStatus(source, [{ ...source, player: 'Nikola Jokic',
    odds: -135, updatedAt: base.toISOString() }], base), /Price moved to -135/);
  assert.match(quoteStatus(source, [{ ...source, sportsbookKey: 'other',
    updatedAt: base.toISOString() }], base), /no longer listed/);
});

test('near-tip update and started-game flag each edit once with durable receipts', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-refresh-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'trends-publications', '2026-11-15');
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${'a'.repeat(32)}.json`);
  await fs.writeFile(file, JSON.stringify({ id: 'a'.repeat(32), status: 'published',
    messageId: '123456789012345678', channelId: '1571285528882450623',
    originalContent: 'Original verified trend', monitorSource: source }));
  let edits = 0, oddsCalls = 0;
  const message = { id: '123456789012345678', content: 'Original verified trend',
    edit: async payload => { edits++; message.content = payload.content; } };
  const args = { root, apiKey: 'fixture', bdlKey: 'fixture', now: base,
    channelFor: async () => ({ id: '1571285528882450623', isTextBased: () => true,
      messages: { fetch: async () => message } }),
    readAvailability: async () => ({ status: 'active-roster-no-listed-injury',
      rightsUrl: 'https://www.balldontlie.io/terms.html' }),
    reserveOdds: async ({ cost, operation }) => { assert.equal(cost, 1); return operation(); },
    readOdds: async () => { oddsCalls++; return { selections: [{ ...source,
      player: 'Nikola Jokic', updatedAt: base.toISOString(), odds: -135 }] }; } };
  await refreshPublishedNbaTrends(args);
  await refreshPublishedNbaTrends(args);
  assert.equal(oddsCalls, 1);
  assert.equal(edits, 1);
  assert.match(message.content, /Price moved to -135/);
  await refreshPublishedNbaTrends({ ...args, now: new Date('2026-11-15T20:01:00Z') });
  await refreshPublishedNbaTrends({ ...args, now: new Date('2026-11-15T20:02:00Z') });
  assert.equal(edits, 2);
  assert.match(message.content, /GAME STARTED/);
});

test('uncertain Discord edit is reconciled from visible message without another edit', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-refresh-uncertain-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'trends-publications', '2026-11-15');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${'b'.repeat(32)}.json`), JSON.stringify({
    id: 'b'.repeat(32), status: 'published', messageId: '123456789012345678',
    channelId: '1571285528882450623', originalContent: 'Original trend', monitorSource: source }));
  let edits = 0;
  const message = { id: '123456789012345678', content: 'Original trend',
    edit: async payload => { edits++; message.content = payload.content; throw new Error('timeout'); } };
  const args = { root, apiKey: 'fixture', bdlKey: 'fixture', now: base,
    channelFor: async () => ({ id: '1571285528882450623', isTextBased: () => true,
      messages: { fetch: async () => message } }),
    readAvailability: async () => ({ status: 'unconfirmed' }) };
  await assert.rejects(refreshPublishedNbaTrends(args), /edit uncertain/);
  await refreshPublishedNbaTrends(args);
  assert.equal(edits, 1);
});
