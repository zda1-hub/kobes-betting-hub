const test = require('node:test');
const assert = require('node:assert/strict');
const { archivedWriteupSource } = require('./writeup-archive-source');
const { publicPreviews } = require('./free-writeup-board');
const row = { pick_id: '20260926-082-X', operating_date: '2026-09-26', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Parker Washington', published_line: 'Over 60.5 receiving yards' };
const packet = { pick_id: '20260926-082', analysis: { extraction: { selection: 'Parker Washington', line: 'Over 60.5 receiving yards', source_claims: ['Washington had 8 targets in the last game.'] } } };

test('deleted Discord writeup can recover matching archived evidence through the redaction parser', async () => {
  const teaser_source = await archivedWriteupSource('/safe/queue', row, { readFile: async path => { assert.equal(path, '/safe/queue/2026-09-26/20260926-082.json'); return JSON.stringify(packet); } });
  assert.match(teaser_source, /8 targets/);
  const preview = publicPreviews([{ ...row, teaser_source }], row.operating_date)[0];
  assert.match(preview.breakdown, /8 targets/);
  assert.doesNotMatch(JSON.stringify(preview), /Parker|Washington/);
});

test('missing, mismatched and unsafe packet identifiers never supply fallback evidence', async () => {
  assert.equal(await archivedWriteupSource('/safe/queue', row, { readFile: async () => { const e = new Error('missing'); e.code = 'ENOENT'; throw e; } }), '');
  assert.equal(await archivedWriteupSource('/safe/queue', row, { readFile: async () => JSON.stringify({ ...packet, pick_id: '20260926-083' }) }), '');
  assert.equal(await archivedWriteupSource('/safe/queue', { ...row, pick_id: '../private' }, { readFile: async () => { throw new Error('must not read'); } }), '');
});
