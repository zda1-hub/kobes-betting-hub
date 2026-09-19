const test = require('node:test');
const assert = require('node:assert/strict');
const { datedTimeOverride } = require('./daily-window');

test('uses a dated Arizona start override only on the matching day', () => {
  const beforeMidnightArizona = new Date('2026-09-20T06:59:00Z');
  const afterMidnightArizona = new Date('2026-09-20T07:01:00Z');
  const config = {
    overrideDate: '2026-09-19',
    overrideAt: '08:00',
    recurringAt: '10:00'
  };

  assert.equal(datedTimeOverride({ ...config, now: beforeMidnightArizona }), '08:00');
  assert.equal(datedTimeOverride({ ...config, now: afterMidnightArizona }), '10:00');
});

test('falls back to the recurring time when a dated override is incomplete', () => {
  const now = new Date('2026-09-19T13:00:00Z');
  assert.equal(datedTimeOverride({ now, overrideDate: '2026-09-19', overrideAt: '', recurringAt: '10:00' }), '10:00');
});
