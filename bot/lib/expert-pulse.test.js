const test = require('node:test');
const assert = require('node:assert/strict');
const { payloadFor, selections, summary, verifiedRecords } = require('./expert-pulse');

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
  assert.match(payloadFor(report).embeds[0].description, /Records and streaks are withheld until verified/);
});

test('shows only linked, independently graded expert results and counts a current win streak', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const published = new Date(now - 86400000).toISOString();
  const base = {
    pick_id: 'pick-1', status: 'PUBLISHED', result: 'W',
    source_name: 'Ben Burns', published_at: published,
    result_verified_source: 'https://www.espn.com/game/1',
    result_verified_at: new Date(now).toISOString(),
    post_reference: 'https://discord.com/channels/123/456/789'
  };
  const rows = [
    base,
    { ...base, pick_id: 'pick-2', post_reference: 'https://discord.com/channels/123/456/790' },
    { ...base, pick_id: 'bad-1', result_verified_source: '', post_reference: 'https://discord.com/channels/123/456/791' },
    { ...base, pick_id: 'bad-2', post_reference: 'https://discord.com/channels/123/999/792' },
    { ...base, pick_id: 'bad-3', status: 'POST_FAILED', post_reference: 'https://discord.com/channels/123/456/793' }
  ];
  const records = verifiedRecords(rows, '456', now);
  assert.equal(records.length, 1);
  assert.equal(records[0].wins, 2);
  assert.equal(records[0].streak, 2);
  assert.match(payloadFor({ active: [], repeated: [], playCount: 0, sourceCount: 0 }, records).embeds[0].description, /2 straight graded wins/);
});
