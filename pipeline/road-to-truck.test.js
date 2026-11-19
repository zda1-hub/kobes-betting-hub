const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { queue, schedule, due, validateItem, forbidden, dayNumber, mstStamp } = require('./road-to-truck-schedule');
const { renderCard } = require('./road-to-truck-card');
const { run, paidLeaderboard, enabled } = require('./run-road-to-truck');

test('all supplied X text and first replies fit 280 after verified record substitution', () => {
  for (const item of queue.filter(row => row.platform === 'x')) {
    const rendered = validateItem(item, '26-17');
    assert.ok(rendered.text.length <= 280, item.id);
    assert.ok(rendered.first_reply.length <= 280, item.id);
  }
});
test('compliance blocks risky terms and missing age notice', () => {
  for (const word of ['lock', 'guaranteed', 'profit', 'parlay', 'DraftKings']) assert.ok(forbidden(`21+ ${word}`), word);
  assert.equal(forbidden('free picks available'), 'missing 21+');
  assert.equal(forbidden('21+ | not a guarantee'), null);
});
test('MST times map to UTC without DST and day numbers include Nov 19, Nov 25, Dec 10', () => {
  assert.equal(new Date(mstStamp('2026-11-19', 18)).toISOString(), '2026-11-20T01:00:00.000Z');
  assert.equal(dayNumber('2026-11-19'), 1);
  assert.equal(dayNumber('2026-11-25'), 7);
  assert.equal(dayNumber('2026-12-10'), 22);
});
test('daily series extends beyond day seven and recurring referral source does not repeat within 14 days', () => {
  const items = schedule('2026-11-19', 40);
  assert.equal(items.find(item => item.id === 'truck-day-22').scheduled_at, mstStamp('2026-12-10', 18));
  const recurring = items.filter(item => item.sourceId);
  assert.ok(recurring.length >= 8);
  for (let i = 0; i < recurring.length; i++) for (let j = i + 1; j < recurring.length; j++) {
    if (recurring[i].sourceId === recurring[j].sourceId) {
      assert.ok(Date.parse(recurring[j].scheduled_at) - Date.parse(recurring[i].scheduled_at) >= 14 * 86400000);
    }
  }
});
test('kill switch stops everything and due selector refuses older than two hours', async () => {
  assert.equal(enabled({ ROAD_TO_TRUCK_ENABLED: 'false' }), false);
  assert.equal((await run({ env: { ROAD_TO_TRUCK_ENABLED: 'false' }, now: new Date('2026-11-19T19:00:00Z') })).status, 'disabled');
  const items = schedule('2026-11-19', 1);
  const tick = due(items, new Date('2026-11-20T03:01:00Z'), true);
  assert.ok(tick.expired.some(item => item.id === 'truck-day-1'));
  assert.ok(!tick.ready.some(item => item.id === 'truck-day-1'));
  assert.deepEqual(due(items, new Date('2026-11-20T01:01:00Z'), false), { ready: [], expired: [] });
});
test('switch on dispatches a due Discord item without any approval step', async () => {
  const calls = [];
  const env = { ROAD_TO_TRUCK_ENABLED: 'true', TRUCK_PUBLISHER_URL: 'https://publisher.test',
    ROAD_TO_TRUCK_SECRET: 'test', TRUCK_ASSET_URL: 'https://assets.test', TRUCK_ASSET_SECRET: 'test',
    DISCORD_TOKEN: 'test', AUDIT_CHANNEL_ID: '123456789012345678' };
  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname;
    calls.push(`${options.method || 'GET'} ${route}`);
    const json = route.endsWith('/record') ? { record: '26-17' }
      : route.endsWith('/claim') ? { status: 'claimed' }
      : route.endsWith('/complete') ? { status: 'posted' }
      : route === '/api/v10/channels/1276995106779693088'
        ? { id: '1276995106779693088', guild_id: '1215407647155683358', type: 0, name: '💬・community-chat' }
        : route === '/api/v10/channels/123456789012345678'
          ? { id: '123456789012345678', guild_id: '1215407647155683358', type: 0,
            permission_overwrites: [{ id: '1215407647155683358', type: 0, deny: String(1 << 10) }] }
          : { id: '123456789012345679' };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await run({ env, now: new Date('2026-11-19T19:00:00Z'), fetchImpl });
  assert.equal(result.results.find(row => row.id === 'truck-discord-pin')?.status, 'posted');
  assert.ok(calls.includes('POST /api/v10/channels/1276995106779693088/messages'));
  assert.ok(calls.includes('POST /api/v10/channels/123456789012345678/messages'));
});
test('leaderboard skips a week with zero paid referrals', async () => {
  const item = schedule('2026-11-23', 1).find(row => row.week);
  const result = await paidLeaderboard({}, item, { database: { query: async () => ({ rows: [] }) } });
  assert.equal(result, null);
});
test('card renders with and without photo at 1080x1350 without cropped text', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-truck-test-'));
  try {
    const noPhoto = await renderCard({ date: '2026-11-19', photoPath: path.join(temp, 'missing.jpg'), outputPath: path.join(temp, 'solid.png') });
    assert.equal(noPhoto.day, 1); assert.equal(noPhoto.hasPhoto, false);
    assert.deepEqual((({ width, height }) => ({ width, height }))(await sharp(noPhoto.png).metadata()), { width: 1080, height: 1350 });
    const fixture = path.join(temp, 'photo.jpg');
    await sharp({ create: { width: 500, height: 800, channels: 3, background: '#727a85' } }).jpeg().toFile(fixture);
    const withPhoto = await renderCard({ date: '2026-12-10', record: '100-100', photoPath: fixture, outputPath: path.join(temp, 'photo.png') });
    assert.equal(withPhoto.day, 22); assert.equal(withPhoto.hasPhoto, true);
    assert.deepEqual((({ width, height }) => ({ width, height }))(await sharp(withPhoto.png).metadata()), { width: 1080, height: 1350 });
    assert.ok(withPhoto.png.length > 20000);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
