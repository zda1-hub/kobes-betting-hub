const test = require('node:test');
const assert = require('node:assert/strict');
const { SLOTS, slotInstant, approvedSlot } = require('./marketing-calendar');

test('all 28 slots resolve to the stated Pacific weekday and clock', () => {
  assert.equal(Object.keys(SLOTS).length, 28);
  const dates = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
  for (const [id, slot] of Object.entries(SLOTS)) {
    const instant = slotInstant(dates[slot.day], id);
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant));
    assert.equal(local, slot.time, id);
  }
  assert.equal(slotInstant('2026-11-12', 'thu1530'), '2026-11-12T23:30:00.000Z');
  assert.equal(slotInstant('2027-07-08', 'thu1530'), '2027-07-08T22:30:00.000Z');
});

test('free pick, native poll and stale slots cannot enter the automatic queue', () => {
  assert.throws(() => approvedSlot('2026-11-09', 'mon1130', Date.parse('2026-11-08T00:00Z')), /existing approved Free Pick/);
  assert.throws(() => approvedSlot('2026-11-10', 'tue0900', Date.parse('2026-11-09T00:00Z')), /native Instagram polls/i);
  assert.throws(() => approvedSlot('2026-11-09', 'mon1830', Date.parse('2026-11-10T03:00Z')), /Missed slots/);
  assert.throws(() => approvedSlot('2026-11-09', 'thu1530', Date.parse('2026-11-08T00:00Z')), /weekday/);
  assert.equal(approvedSlot('2026-11-12', 'thu1530', Date.parse('2026-11-12T22:50Z')).id, 'cal-20261112-thu1530');
});
