const test = require('node:test');
const assert = require('node:assert/strict');
const { arizonaClock, createExpertTrendReminder } = require('./expert-trend-reminder');

test('Arizona morning review reminder sends once, links the existing card, and mentions only Kobe', async () => {
  const posts = new Map();
  const card = { id: 'card-1', content: '0 approved · 0 rejected · 32 pending' };
  let instant = Date.parse('2026-10-02T13:59:00Z');
  const channel = { id: 'review-1', guild: { id: 'guild-1', ownerId: 'kobe-1' },
    messages: { fetch: async (request) => typeof request === 'object' ? posts : card },
    send: async (payload) => {
      const message = { id: `reminder-${posts.size + 1}`, ...payload };
      posts.set(message.id, message);
      return message;
    } };
  const remind = createExpertTrendReminder({ channelFor: async () => channel, now: () => instant });
  assert.deepEqual(arizonaClock(instant), { date: '2026-10-02', time: '06:59' });
  assert.equal((await remind({ messageId: card.id, expertCount: 32 })).status, 'BEFORE_MORNING_WINDOW');
  instant += 60_000;
  const sent = await remind({ messageId: card.id, expertCount: 32 });
  assert.equal(sent.status, 'NOTIFIED');
  assert.equal(sent.pending, 32);
  assert.equal(posts.size, 1);
  const message = [...posts.values()][0];
  assert.match(message.content, /<@kobe-1>/);
  assert.match(message.content, /https:\/\/discord.com\/channels\/guild-1\/review-1\/card-1/);
  assert.deepEqual(message.allowedMentions, { parse: [], users: ['kobe-1'] });
  assert.equal((await remind({ messageId: card.id, expertCount: 32 })).status, 'ALREADY_NOTIFIED');
  const afterRestart = createExpertTrendReminder({ channelFor: async () => channel, now: () => instant });
  assert.equal((await afterRestart({ messageId: card.id, expertCount: 32 })).status, 'ALREADY_NOTIFIED');
  assert.equal(posts.size, 1);
});
