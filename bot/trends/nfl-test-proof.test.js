'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runNflTestProof } = require('./nfl-test-proof');

test('NFL proof sends one labeled card, observes it, deletes it, and keeps receipt', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nfl-proof-'));
  const now = new Date('2026-11-16T20:00:00Z');
  const row = { hits: 2, sample: 5, pushes: 0, hitRate: 0.4 };
  const candidate = { player: 'Real Player', analysisSource: 'https://example.test/logs',
    analysis: { season: row, l5: row, l10: row, l20: row },
    prop: { sport: 'NFL', stat: 'receptions', side: 'over', line: 4.5,
      odds: -120, sportsbook: 'Book', eventId: 'real-event', updatedAt: now.toISOString() } };
  let content; let fetches = 0; let sends = 0;
  const channel = { id: '123456789012345678', isTextBased: () => true,
    async send(payload) { sends++; content = payload.content; return { id: '987654321098765432',
      async delete() {} }; }, messages: { async fetch() {
      fetches++; if (fetches === 1) return { content };
      throw Object.assign(new Error('Unknown Message'), { code: 10008 });
    } } };
  const options = { root, apiKey: 'fixture', channelId: channel.id,
    channelFor: async () => channel, now, collect: async () => candidate };
  const result = await runNflTestProof(options);
  assert.equal(result.status, 'verified_deleted');
  assert.match(content, /^\*\*TEST — NOT A PICK/);
  assert.equal((await runNflTestProof(options)).existing, true);
  assert.equal(sends, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('cleanup receipt reconciles missing message without a second send', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nfl-proof-cleanup-'));
  const now = new Date('2026-11-16T20:00:00Z');
  const directory = path.join(root, 'trends-test');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, '2026-11-16.json'), JSON.stringify({
    status: 'needs_cleanup', channelId: '123456789012345678',
    messageId: '987654321098765432', player: 'Real Player'
  }));
  const result = await runNflTestProof({ root, apiKey: 'fixture',
    channelId: '123456789012345678', now,
    channelFor: async () => ({ messages: { async fetch() {
      throw Object.assign(new Error('Unknown Message'), { code: 10008 });
    } } }), collect: async () => { throw new Error('must not select or send'); } });
  assert.equal(result.status, 'verified_deleted');
  assert.equal(result.reconciled, true);
  await fs.rm(root, { recursive: true, force: true });
});
