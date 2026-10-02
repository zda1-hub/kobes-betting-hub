const test = require('node:test');
const assert = require('node:assert/strict');
const { createMorningDeliveryAlert } = require('./morning-delivery-alert');

test('7:30 AM Arizona check alerts Kobe only for missing delivery, once across restarts', async () => {
  const posts = new Map();
  const channel = {
    guild: { ownerId: 'owner-1' },
    messages: { fetch: async () => posts },
    send: async (payload) => {
      const item = { id: `message-${posts.size + 1}`, ...payload };
      posts.set(item.id, item);
      return item;
    }
  };
  let instant = Date.parse('2026-10-02T14:29:00Z');
  let issues = ['Expert trend review card is unavailable.'];
  const options = { channelFor: async () => channel, statusFor: async () => issues, now: () => instant };
  const check = createMorningDeliveryAlert(options);
  assert.equal((await check()).status, 'BEFORE_DEADLINE');
  instant += 60_000;
  issues = [];
  assert.equal((await check()).status, 'HEALTHY');
  issues = ['Public results have not reached Discord.'];
  assert.equal((await check()).status, 'ALERTED');
  assert.equal(posts.size, 1);
  assert.deepEqual([...posts.values()][0].allowedMentions, { parse: [], users: ['owner-1'] });
  assert.equal((await check()).status, 'ALREADY_CHECKED');
  assert.equal((await createMorningDeliveryAlert(options)()).status, 'ALREADY_NOTIFIED');
  assert.equal(posts.size, 1);
});
