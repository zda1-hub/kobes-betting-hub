const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { activeWindow, alertDescription, createArbitragePaperMonitor, findArbitrage } = require('./arbitrage-paper-monitor');

const event = { id: 'game-1', sport_title: 'NBA', away_team: 'Away', home_team: 'Home', commence_time: '2026-09-24T01:00:00Z', bookmakers: [
  { key: 'fanduel', title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.2 }, { name: 'Home', price: 1.7 }] }] },
  { key: 'draftkings', title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.0 }, { name: 'Home', price: 2.2 }] }] }
] };

test('finds a two-book arbitrage and produces a balanced $1,000 example', () => {
  const [opportunity] = findArbitrage([event], { minimumEdgePercent: 2, bankroll: 1000 });
  assert.ok(opportunity.edgePercent > 9);
  assert.equal(Math.round(opportunity.legs.reduce((sum, leg) => sum + leg.stake, 0)), 1000);
  assert.equal(opportunity.legs[0].book, 'fanduel');
  assert.equal(opportunity.legs[1].book, 'draftkings');
  assert.match(alertDescription(opportunity), /Total example: \*\*\$1000\.00\*\*/);
});

test('rejects non-arbitrage, same-book, draw markets and sub-threshold edges', () => {
  assert.equal(findArbitrage([{ ...event, bookmakers: [event.bookmakers[0]] }]).length, 0);
  const draw = structuredClone(event); draw.bookmakers[0].markets[0].outcomes.push({ name: 'Draw', price: 3 });
  assert.equal(findArbitrage([draw]).length, 0);
  assert.equal(findArbitrage([event], { minimumEdgePercent: 20 }).length, 0);
});

test('uses short Arizona monitoring windows', () => {
  assert.equal(activeWindow(new Date('2026-09-23T16:35:00Z'), ['09:30'], 25), '09:30');
  assert.equal(activeWindow(new Date('2026-09-23T16:56:00Z'), ['09:30'], 25), null);
});

test('supports a continuous 8 AM to 3 PM Arizona monitoring range', () => {
  assert.equal(activeWindow(new Date('2026-09-23T15:00:00Z'), ['08:00-15:00']), '08:00-15:00');
  assert.equal(activeWindow(new Date('2026-09-23T21:59:00Z'), ['08:00-15:00']), '08:00-15:00');
  assert.equal(activeWindow(new Date('2026-09-23T22:00:00Z'), ['08:00-15:00']), null);
});

test('Kobe can approve a current card in dry-run mode without member publication', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const edits = [], sends = [], memberPosts = [];
  const message = { id: 'review-message', edit: async (payload) => edits.push(payload) };
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async (payload) => { sends.push(payload); return message; } };
  const destinationChannel = { send: async (payload) => { memberPosts.push(payload); return { id: 'member-message' }; } };
  const fetchImpl = async () => new Response(JSON.stringify([event]), { status: 200, headers: { 'x-requests-remaining': '490', 'x-requests-used': '10' } });
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, destinationChannel,
    stateFile: path.join(root, 'state.json'), fetchImpl, now: () => new Date('2026-09-23T18:00:00Z'),
    windows: ['08:00-15:00'], memberPostingEnabled: false, isApprover: ({ userId }) => userId === 'kobe' });
  await monitor.start();
  const result = await monitor.decide({ customId: 'arbitrage-review:approve:game-1:h2h', userId: 'kobe',
    guildId: 'guild', channelId: 'review', message });
  await monitor.stop();
  assert.equal(sends.length, 1);
  assert.equal(result.status, 'DRY_RUN_APPROVED');
  assert.equal(memberPosts.length, 0);
  assert.match(edits.at(-1).embeds[0].description, /MEMBER POST HELD/);
});

test('unauthorized arbitrage review is blocked', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const message = { id: 'review-message', edit: async () => {} };
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => message };
  const fetchImpl = async () => new Response(JSON.stringify([event]), { status: 200 });
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, destinationChannel: null,
    stateFile: path.join(root, 'state.json'), fetchImpl, now: () => new Date('2026-09-23T18:00:00Z'),
    windows: ['08:00-15:00'], isApprover: () => false });
  await monitor.start();
  await assert.rejects(monitor.decide({ customId: 'arbitrage-review:approve:game-1:h2h', userId: 'stranger',
    guildId: 'guild', channelId: 'review', message }), /Only Kobe/);
  await monitor.stop();
});
