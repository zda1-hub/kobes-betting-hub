'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { eligibleEvents, scanDaily } = require('./daily-scan');

test('Pacific calendar filter excludes past and next-day games', () => {
  const now = new Date('2026-11-15T08:05:00Z');
  const rows = [
    { id: 'past', home_team: 'A', away_team: 'B', commence_time: '2026-11-15T08:04:00Z' },
    { id: 'today', home_team: 'A', away_team: 'B', commence_time: '2026-11-16T07:55:00Z' },
    { id: 'tomorrow', home_team: 'A', away_team: 'B', commence_time: '2026-11-16T08:05:00Z' }
  ];
  assert.deepEqual(eligibleEvents(rows, '2026-11-15', now).map(row => row.id), ['today']);
});

test('daily scan persists one real inventory and never claims publication', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-daily-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date('2026-11-15T08:05:00Z');
  let calls = 0;
  const args = { root, apiKey: 'fixture-key', now,
    readEvents: async sport => { calls++; if (sport === 'MLB') throw new Error('offseason');
      return { data: [{ id: sport, home_team: 'Home', away_team: 'Away', commence_time: '2026-11-15T20:00:00Z' }], fetchedAt: now.toISOString() }; },
    readPopularCombos: async () => ({ combos: [{ id: 'measured-combo' }] }) };
  const first = await scanDaily(args);
  const second = await scanDaily(args);
  assert.equal(calls, 4);
  assert.equal(first.publication, 'held');
  assert.equal(first.popularity.eligibleCombos, 1);
  assert.equal(first.leagues.MLB.error, 'offseason');
  assert.equal(second.existing, true);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'trends-daily/2026-11-15.json'), 'utf8')).leagues.NBA.events.map(row => row.id), ['NBA']);
});
