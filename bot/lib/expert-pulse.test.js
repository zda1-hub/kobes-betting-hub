const test = require('node:test');
const assert = require('node:assert/strict');
const { createExpertPulse, payloadFor, selections, summary, verifiedRecords } = require('./expert-pulse');

test('counts structured picks from all qualifying posts today, not last week', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const posts = [
    { content: 'Ben Burns\n• Broncos ML -110\n• Cowboys +3', createdTimestamp: now - 1000 },
    { content: 'Kelly In Vegas\n• Broncos ML -110', createdTimestamp: now - 2000 },
    { content: 'Ben Burns\n• Old pick', createdTimestamp: now - 86400000 },
    { content: 'General chatter here', createdTimestamp: now - 1000 }
  ];
  assert.deepEqual(selections(posts[0]), ['Broncos ML -110', 'Cowboys +3']);
  const report = summary(posts, now);
  assert.equal(report.playCount, 3);
  assert.equal(report.sourceCount, 2);
  assert.equal(report.date, '2026-09-21');
  assert.deepEqual(report.repeated, [{ play: 'Broncos ML -110', count: 2 }]);
  assert.match(payloadFor(report).embeds[0].description, /Records and streaks are withheld until verified/);
});

test('shows all-time linked, individually graded paid expert results, including losses and pushes', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const published = new Date(now - 86400000).toISOString();
  const base = {
    pick_id: 'pick-1', status: 'GRADED', result: 'W', wager_scope: 'individual',
    source_name: 'Ben Burns', published_at: published,
    result_verified_source: 'https://www.espn.com/game/1',
    result_verified_at: new Date(now).toISOString(),
    post_reference: 'https://discord.com/channels/123/456/789'
  };
  const rows = [
    base,
    { ...base, pick_id: 'pick-2', published_at: '2025-01-01T12:00:00Z', post_reference: 'https://discord.com/channels/123/456/790' },
    { ...base, pick_id: 'pick-3', result: 'L', post_reference: 'https://discord.com/channels/123/456/794' },
    { ...base, pick_id: 'pick-4', result: 'P', post_reference: 'https://discord.com/channels/123/456/795' },
    { ...base, pick_id: 'group-parent', wager_scope: '', post_reference: 'https://discord.com/channels/123/456/796' },
    { ...base, pick_id: 'bad-1', result_verified_source: '', post_reference: 'https://discord.com/channels/123/456/791' },
    { ...base, pick_id: 'bad-2', post_reference: 'https://discord.com/channels/123/999/792' },
    { ...base, pick_id: 'bad-3', status: 'POST_FAILED', post_reference: 'https://discord.com/channels/123/456/793' }
  ];
  const records = verifiedRecords(rows, ['456']);
  assert.equal(records.length, 1);
  assert.equal(records[0].wins, 2);
  assert.equal(records[0].losses, 1);
  assert.equal(records[0].pushes, 1);
  assert.equal(records[0].streak, 0);
  assert.match(payloadFor({ date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 }, records).embeds[0].description, /2-1-1P-0V/);
});

test('refuses to publish the digest when VIP channel privacy is public or unverified', async () => {
  const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
  const source = { id: '456', guild };
  for (const visible of [true, undefined]) {
    const destination = { id: '789', guild, permissionsFor: () => ({ has: () => visible }) };
    await assert.rejects(createExpertPulse({
      sourceChannelFor: async () => source,
      destinationChannelFor: async () => destination,
      stateFile: '/tmp/unused-expert-pulse-state.json'
    }), /privacy could not be verified/);
  }
});
