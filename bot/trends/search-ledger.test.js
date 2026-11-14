'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { recordSearch } = require('./search-ledger');

test('records a successful search once per user and threshold without raw Discord IDs', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-trends-ledger-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date('2026-11-15T07:30:00Z'); // November 14 in Pacific time
  const query = { sport: 'NBA', player: 'Jalen Brunson', stat: 'points', side: 'over', line: 20.5 };
  const ids = ['123456789012345678', '123456789012345679'];
  const calls = await Promise.all([recordSearch({ root, userId: ids[0], query, now }),
    recordSearch({ root, userId: ids[0], query, now }), recordSearch({ root, userId: ids[1], query, now })]);
  assert.deepEqual(calls.map(row => row.recorded).sort(), [false, true, true]);
  const file = path.join(root, 'trends-searches', '2026-11-14.json');
  const raw = await fs.readFile(file, 'utf8');
  assert.equal(raw.includes(ids[0]), false);
  assert.equal(raw.includes(ids[1]), false);
  const ledger = JSON.parse(raw);
  assert.equal(ledger.searches.length, 2);
  assert.equal(new Set(ledger.searches.map(row => row.searcher)).size, 2);
});

test('rejects invalid searches and refuses to overwrite a corrupt ledger', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-trends-ledger-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date('2026-11-15T07:30:00Z');
  const query = { sport: 'NBA', player: 'Jalen Brunson', stat: 'points', side: 'over', line: 20.5 };
  await assert.rejects(recordSearch({ root, userId: '123456789012345678', query: { ...query, line: NaN }, now }));
  const directory = path.join(root, 'trends-searches');
  await fs.mkdir(directory);
  const file = path.join(directory, '2026-11-14.json');
  await fs.writeFile(file, '{bad');
  await assert.rejects(recordSearch({ root, userId: '123456789012345678', query, now }));
  assert.equal(await fs.readFile(file, 'utf8'), '{bad');
});
