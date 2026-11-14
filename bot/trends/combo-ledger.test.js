'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizeLegs, recordCombo, popularCombos } = require('./combo-ledger');

const legs = [
  'NBA|New York Knicks|Jalen Brunson|points|over|20.5',
  'NBA|Boston Celtics|Jayson Tatum|rebounds|over|6.5'
];
const now = new Date('2026-11-15T04:00:00Z');

test('counts explicit exact-combination requests once per member per Pacific day', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-trends-combo-'));
  try {
    for (let i = 0; i < 5; i++) {
      const result = await recordCombo({ root, userId: `12345678901234567${i}`, rawLegs: i % 2 ? legs.slice().reverse() : legs, now });
      assert.equal(result.distinctSearchers, i + 1);
      assert.equal(result.eligibleForPopularityReview, i === 4);
    }
    const duplicate = await recordCombo({ root, userId: '123456789012345670', rawLegs: legs, now });
    assert.equal(duplicate.recorded, false);
    assert.equal(duplicate.distinctSearchers, 5);
    const popular = await popularCombos({ root, now });
    assert.equal(popular.combos.length, 1);
    const raw = await fs.readFile(path.join(root, 'trends-combos', `${popular.serviceDate}.json`), 'utf8');
    assert.doesNotMatch(raw, /12345678901234567/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rejects unsupported or duplicate legs without manufacturing popularity', () => {
  assert.throws(() => normalizeLegs([legs[0], legs[0]]), /Duplicate/);
  assert.throws(() => normalizeLegs([legs[0], 'NBA|Boston Celtics|Jayson Tatum|made_up|over|6.5']), /unsupported/);
  assert.throws(() => normalizeLegs([legs[0]]), /two to four/);
});
