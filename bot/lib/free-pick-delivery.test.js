const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createFreePickDelivery, eligibleFreeRows } = require('./free-pick-delivery');
const date = '2026-09-17';
const row = { pick_id: 'today-1', operating_date: date, selection: 'Player over 4.5 receptions',
  published_line: '4.5', published_odds_american: '-110', published_by: 'bot', status: 'PUBLISHED',
  published_at: '2026-09-17T17:00:00Z', post_reference: 'https://discord.com/channels/1/2/3' };
const packet = { pick_id: row.pick_id, analysis: { extraction: { selection: row.selection, line: '4.5', odds_american: '-110' } } };
async function setup(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'free-delivery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [];
  const options = { root, channelId: '2', today: () => date, readRows: async () => [row], loadPacket: async () => packet,
    verifyPost: async () => true, publishSite: async (_packet, options) => { calls.push(['site', options]); return { status: 'published' }; },
    readX: async () => ({ status: 'not_requested' }), publishX: async () => { calls.push(['x']); return { status: 'published', xPostId: 'receipt' }; },
    logger: { error() {}, warn() {} }, ...overrides };
  return { calls, options, delivery: createFreePickDelivery(options) };
}
test('only current-day canonical Free Pick destination is eligible; no stale or paid replay', () => {
  assert.equal(eligibleFreeRows([row, { ...row, operating_date: '2026-09-15' }, { ...row, post_reference: 'https://discord.com/channels/1/9/3' }], date, '2').length, 1);
});
test('single writer and restart checkpoint prevent duplicate website/X writes', async (t) => {
  const { calls, delivery, options } = await setup(t);
  await Promise.all([delivery.run(), delivery.run()]);
  await createFreePickDelivery(options).run();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['site', { copyImage: false, date }]);
});
test('website failure is retried without changing pick date or posting a duplicate X request', async (t) => {
  let attempts = 0;
  const { delivery, calls } = await setup(t, { publishSite: async () => { if (++attempts === 1) throw new Error('offline'); return { status: 'published' }; } });
  await delivery.run(); await delivery.run();
  assert.equal(attempts, 2); assert.equal(calls.filter(c => c[0] === 'x').length, 1);
});
test('ambiguous X response recovers through original provider receipt, not a second post', async (t) => {
  let exists = false, writes = 0;
  const { delivery } = await setup(t, { readX: async () => ({ status: exists ? 'published' : 'not_requested' }),
    publishX: async () => { exists = true; writes++; throw new Error('response lost'); } });
  await delivery.run(); await delivery.run();
  assert.equal(writes, 1);
});
test('failed/publishing X receipt is held for review; never resubmitted blindly', async (t) => {
  const { delivery, calls } = await setup(t, { readX: async () => ({ status: 'publishing' }) });
  const results = await delivery.run(); await delivery.run();
  assert.equal(results[0].held, 'X_publishing'); assert.equal(calls.filter(c => c[0] === 'x').length, 0);
});
test('changed odds or a missing Discord post blocks every external delivery', async (t) => {
  const { delivery, calls } = await setup(t, { loadPacket: async () => ({ ...packet, analysis: { extraction: { ...packet.analysis.extraction, odds_american: '-500' } } }) });
  await delivery.run(); assert.equal(calls.length, 0);
});
test('kill switch blocks recovery', async (t) => {
  const { delivery, calls } = await setup(t, { paused: async () => true });
  await delivery.run(); assert.equal(calls.length, 0);
});
test('receipt already queued is left to Publisher cron without a new POST', async (t) => {
  const { delivery, calls } = await setup(t, { readX: async () => ({ status: 'approved' }) });
  await delivery.run(); assert.equal(calls.filter(c => c[0] === 'x').length, 0);
});
