const test = require('node:test');
const assert = require('node:assert/strict');
const { payloadFor, selections, summary } = require('./expert-pulse');

test('counts only recent structured expert picks and does not invent streaks', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const posts = [
    { content: 'Ben Burns\n• Broncos ML -110\n• Cowboys +3', createdTimestamp: now - 1000 },
    { content: 'Kelly In Vegas\n• Broncos ML -110', createdTimestamp: now - 2000 },
    { content: 'Ben Burns\n• Old pick', createdTimestamp: now - 8 * 86400000 },
    { content: 'General chatter here', createdTimestamp: now - 1000 }
  ];
  assert.deepEqual(selections(posts[0]), ['Broncos ML -110', 'Cowboys +3']);
  const report = summary(posts, now);
  assert.equal(report.playCount, 3);
  assert.equal(report.sourceCount, 2);
  assert.deepEqual(report.repeated, [{ play: 'Broncos ML -110', count: 2 }]);
  assert.match(payloadFor(report).embeds[0].description, /Hot streaks:.*Not shown/);
});
