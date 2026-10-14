const test = require('node:test');
const assert = require('node:assert/strict');
const { baselineNames, expertName, listMonth, managedNames, namesFromMessages, payloadFor } = require('./vip-expert-list');

test('reads Kobe’s original list and recognizes only actual expert-picks posts', () => {
  const list = { content: 'September 2026 Updated List - Alphabetical Order\n- Ben Burns ($150/week)\n- McBets ($39.99/week)\n- LearLocks ($10/3 days)\nTotal: 3 cappers/sources.' };
  assert.deepEqual(baselineNames(list), ['Ben Burns', 'McBets', 'LearLocks']);
  assert.equal(listMonth(list), 'September 2026');
  assert.equal(expertName({ content: 'Hammering Hank 5u max\n• Falcons +2.5' }), 'Hammering Hank');
  assert.equal(expertName({ content: 'Kyren Williams Over 50.5 yards' }), '');
  const names = namesFromMessages([
    { content: 'MC BETS\n• Broncos ML' },
    { content: 'Kelly In Vegas\n• Rams -6.5' },
    { content: 'Hammering Hank 5u max\n• Falcons +2.5' }
  ], baselineNames(list));
  assert.deepEqual(names, ['Ben Burns', 'Hammering Hank', 'Kelly In Vegas', 'LearLocks', 'McBets']);
  const payload = payloadFor(names);
  assert.equal(payload.embeds[0].title, 'Current list of experts: 5');
  assert.deepEqual(managedNames({ embeds: payload.embeds }), names);
  assert.equal(payload.content, '');
  assert.equal(payload.embeds[0].footer.text, 'KBH vip-expert-list-v1');
  assert.doesNotMatch(JSON.stringify(payload), /Falcons|Broncos|Rams|\$150/);
});

const { previousDayRecords, previousMstDate } = require('./vip-expert-list');
test('previous MST date does not switch days at Pacific DST midnight', () => {
  assert.equal(previousMstDate(new Date('2026-10-13T07:30:00Z')), '2026-10-12');
  assert.equal(previousMstDate(new Date('2026-10-13T06:30:00Z')), '2026-10-11');
  assert.equal(previousMstDate(new Date('2026-01-02T07:30:00Z')), '2026-01-01');
});
test('verified yesterday records deduplicate reposts and hold conflicts and unverified groups', () => {
  const base = { operating_date: '2026-10-12', source_name: 'Alpha', published_at: '2026-10-12T20:00:00Z', post_reference: 'https://discord.com/channels/1/2/3', status: 'GRADED', result_verified_source: 'verified', wager_scope: 'individual' };
  const rows = [
    { ...base, pick_id: 'a', selection: 'Team ML', result: 'W' },
    { ...base, pick_id: 'b', selection: 'Team ML', result: 'W' },
    { ...base, pick_id: 'c', selection: 'Other ML', result: 'L' },
    { ...base, pick_id: 'd', selection: 'Conflict ML', result: 'W' },
    { ...base, pick_id: 'e', selection: 'Conflict ML', result: 'L' },
    { ...base, pick_id: 'tg-20261012-1-1', selection: 'Group', result: 'W', wager_scope: '' },
    { ...base, pick_id: 'f', selection: 'Unverified', result: 'W', result_verified_source: '' },
    { ...base, pick_id: 'g', selection: 'Not published', result: 'W', published_at: '' },
    { ...base, pick_id: 'h', selection: 'Today', result: 'W', operating_date: '2026-10-13' }
  ];
  const records = previousDayRecords(rows, '2026-10-12');
  assert.deepEqual(records.get('alpha'), { W: 1, L: 1, P: 0, V: 0, PENDING: 3 });
  const payload = payloadFor(['Zulu', 'Alpha'], { date: '2026-10-12', records });
  assert.match(payload.embeds[0].description, /01\. Alpha.*1-1 \(3 pending\)/);
  assert.match(payload.embeds[0].description, /02\. Zulu.*no verified results/);
  assert.deepEqual(managedNames({ embeds: payload.embeds }), ['Alpha', 'Zulu']);
});
