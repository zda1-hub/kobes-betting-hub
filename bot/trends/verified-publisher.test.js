'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertEvidence } = require('./verified-publisher');

test('paid trend publication rejects research with unconfirmed upstream rights', () => {
  assert.throws(() => assertEvidence({
    player: 'Example Player',
    rights: { history: 'unverified', availability: 'unverified' }
  }, Date.parse('2026-11-15T19:00:00Z')), /Commercial source rights/);
});
