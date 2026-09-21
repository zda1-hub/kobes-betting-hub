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
  const payload = payloadFor(names, 3, `${listMonth(list)} List`);
  assert.equal(payload.embeds[0].title, 'September 2026 List');
  assert.deepEqual(managedNames({ embeds: payload.embeds }), names);
  assert.match(payload.content, /5 sources.*2 added/);
  assert.doesNotMatch(JSON.stringify(payload), /Falcons|Broncos|Rams|\$150/);
});
