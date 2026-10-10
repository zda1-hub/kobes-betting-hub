const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { activeWindow, alertDescription, arbitrageBookmakers, arbitrageSports, createArbitragePaperMonitor, findArbitrage } = require('./arbitrage-paper-monitor');

test('uses all nine Arizona books covered by the feed within one quota group and allows a narrower member list', () => {
  const books = arbitrageBookmakers();
  assert.equal(books.length, 9);
  assert.ok(books.includes('hardrockbet_az'));
  assert.ok(books.includes('espnbet'));
  assert.deepEqual(arbitrageBookmakers('fanduel, betrivers, fanduel'), ['fanduel', 'betrivers']);
  assert.throws(() => arbitrageBookmakers('bad-key'), /ARBITRAGE_BOOKMAKERS/);
});

test('scans football and baseball sport feeds by default', () => {
  assert.deepEqual(arbitrageSports(), ['americanfootball_nfl', 'americanfootball_ncaaf', 'baseball_mlb']);
  assert.deepEqual(arbitrageSports('baseball_mlb, baseball_mlb'), ['baseball_mlb']);
});

const event = { id: 'game-1', sport_title: 'NBA', away_team: 'Away', home_team: 'Home', commence_time: '2026-09-24T01:00:00Z', bookmakers: [
  { key: 'fanduel', title: 'FanDuel', last_update: '2026-09-23T17:59:00Z', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.2 }, { name: 'Home', price: 1.7 }] }] },
  { key: 'draftkings', title: 'DraftKings', last_update: '2026-09-23T17:59:00Z', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.0 }, { name: 'Home', price: 2.2 }] }] }
] };

test('finds a two-book arbitrage and produces a balanced $1,000 example', () => {
  const [opportunity] = findArbitrage([event], { minimumEdgePercent: 2, bankroll: 1000 });
  assert.ok(opportunity.edgePercent > 9);
  assert.equal(Math.round(opportunity.legs.reduce((sum, leg) => sum + leg.stake, 0)), 1000);
  assert.equal(opportunity.legs[0].book, 'fanduel');
  assert.equal(opportunity.legs[1].book, 'draftkings');
  assert.match(alertDescription(opportunity), /Total example: \*\*\$1000\.00\*\*/);
  assert.doesNotMatch(alertDescription(opportunity), /paper test/i);
  assert.match(alertDescription(opportunity), /AWAITING KOBE APPROVAL/);
});

test('finds a cross-book edge when one book has the highest price on both sides', () => {
  const oneEvent = structuredClone(event);
  oneEvent.bookmakers = [
    { key: 'fanduel', title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.2 }, { name: 'Home', price: 2.2 }] }] },
    { key: 'draftkings', title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.05 }, { name: 'Home', price: 2.05 }] }] }
  ];
  const [opportunity] = findArbitrage([oneEvent], { minimumEdgePercent: 1 });
  assert.ok(opportunity);
  assert.notEqual(opportunity.legs[0].book, opportunity.legs[1].book);
  assert.ok(opportunity.edgePercent > 1);
});

test('uses the market quote timestamp when the bookmaker timestamp is stale', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const current = structuredClone(event);
  current.bookmakers.forEach(book => {
    book.last_update = '2026-09-23T17:40:00Z';
    book.markets[0].last_update = '2026-09-23T17:59:00Z';
  });
  const cards = [];
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' },
    send: async payload => { cards.push(payload); return { id: 'card', edit: async () => {} }; } };
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel,
    stateFile: path.join(root, 'state.json'),
    fetchImpl: async () => new Response(JSON.stringify([current]), { status: 200 }),
    now: () => new Date('2026-09-23T18:00:00Z'), windows: ['08:00-15:00'] });
  const result = await monitor.start();
  await monitor.stop();
  assert.equal(result.opportunityCount, 1);
  assert.equal(cards.length, 1);
  assert.match(cards[0].embeds[0].description, /Quote 1 updated:/);
});

test('uses a fresh second-best price when the top bookmaker quote is stale', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const current = structuredClone(event);
  current.bookmakers[0].markets[0].last_update = '2026-09-23T17:40:00Z';
  current.bookmakers[1].markets[0].last_update = '2026-09-23T17:59:00Z';
  current.bookmakers.push({ key: 'betmgm', title: 'BetMGM', markets: [{ key: 'h2h',
    last_update: '2026-09-23T17:59:00Z', outcomes: [{ name: 'Away', price: 2.15 }, { name: 'Home', price: 1.7 }] }] });
  const cards = [];
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' },
    send: async payload => { cards.push(payload); return { id: 'card', edit: async () => {} }; } };
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel,
    stateFile: path.join(root, 'state.json'),
    fetchImpl: async () => new Response(JSON.stringify([current]), { status: 200 }),
    now: () => new Date('2026-09-23T18:00:00Z'), windows: ['08:00-15:00'] });
  const result = await monitor.start();
  await monitor.stop();
  assert.equal(result.opportunityCount, 1);
  assert.equal(cards.length, 1);
  assert.match(cards[0].embeds[0].description, /BetMGM/);
  assert.doesNotMatch(cards[0].embeds[0].description, /FanDuel/);
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

test('supports a continuous 8 AM to 6 PM Arizona monitoring range', () => {
  assert.equal(activeWindow(new Date('2026-09-23T15:00:00Z'), ['08:00-18:00']), '08:00-18:00');
  assert.equal(activeWindow(new Date('2026-09-24T00:59:00Z'), ['08:00-18:00']), '08:00-18:00');
  assert.equal(activeWindow(new Date('2026-09-24T01:00:00Z'), ['08:00-18:00']), null);
});

test('one-minute cadence scans again after one minute and never earlier', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  let current = new Date('2026-09-23T18:00:00Z');
  let requests = 0;
  const monitor = createArbitragePaperMonitor({ apiKey: 'test',
    reviewChannel: { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => {} },
    stateFile: path.join(root, 'state.json'), intervalMinutes: 1,
    fetchImpl: async () => { requests += 1; return new Response('[]', { status: 200 }); },
    now: () => current, windows: ['08:00-15:00'] });
  try {
    await monitor.start();
    current = new Date('2026-09-23T18:00:59Z');
    assert.equal((await monitor.scan()).status, 'TOO_SOON');
    current = new Date('2026-09-23T18:01:00Z');
    assert.equal((await monitor.scan()).status, 'SCANNED');
    assert.equal(requests, 2);
  } finally { await monitor.stop(); }
});

test('archives a Kobe-approved example only after its live edge has passed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  let current = new Date('2026-09-23T18:00:00Z');
  let available = true;
  const archived = [];
  const reviewMessage = { id: 'review-card', edit: async () => {} };
  const monitor = createArbitragePaperMonitor({ apiKey: 'test',
    reviewChannel: { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => reviewMessage },
    destinationChannel: { send: async () => ({ id: 'vip-message' }) },
    archiveChannel: { send: async payload => { archived.push(payload); return { id: 'archive-message' }; } },
    stateFile: path.join(root, 'state.json'), memberPostingEnabled: true, isApprover: () => true,
    fetchImpl: async () => new Response(JSON.stringify(available ? [event] : []), { status: 200 }),
    now: () => current, windows: ['08:00-15:00'] });
  try {
    await monitor.start();
    await monitor.decide({ customId: 'arbitrage-review:approve:game-1:h2h', userId: 'owner',
      guildId: 'guild', channelId: 'review', message: reviewMessage });
    current = new Date('2026-09-23T18:29:00Z');
    available = false;
    await monitor.scan();
    assert.equal(archived.length, 0);
    current = new Date('2026-09-23T18:35:00Z');
    await monitor.scan();
    assert.equal(archived.length, 1);
    assert.match(archived[0].embeds[0].description, /theoretical return/);
    assert.match(archived[0].embeds[0].description, /not a verified member profit/);
    current = new Date('2026-09-23T18:41:00Z');
    await monitor.scan();
    assert.equal(archived.length, 1);
  } finally { await monitor.stop(); }
});

test('stale source quotes do not create arbitrage approval cards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const stale = structuredClone(event);
  stale.bookmakers.forEach(book => { book.last_update = '2026-09-23T17:40:00Z'; });
  const sends = [];
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async payload => sends.push(payload) };
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, destinationChannel: null,
    stateFile: path.join(root, 'state.json'),
    fetchImpl: async () => new Response(JSON.stringify([stale]), { status: 200 }),
    now: () => new Date('2026-09-23T18:00:00Z'), windows: ['08:00-15:00'] });
  const result = await monitor.start();
  await monitor.stop();
  assert.equal(result.opportunityCount, 0);
  assert.equal(sends.length, 0);
});

test('successful routine scans log their time, window, counts and feed quota', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const logs = [];
  const monitor = createArbitragePaperMonitor({ apiKey: 'test',
    reviewChannel: { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => {} },
    stateFile: path.join(root, 'state.json'),
    fetchImpl: async () => new Response('[]', { status: 200, headers: { 'x-requests-remaining': '99', 'x-requests-used': '1' } }),
    now: () => new Date('2026-09-23T18:00:00Z'), windows: ['08:00-15:00'], log: message => logs.push(message) });
  await monitor.start();
  await monitor.stop();
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0].replace(/^Arbitrage scan: /, '')), {
    scannedAt: '2026-09-23T18:00:00.000Z', window: '08:00-15:00', sports: ['upcoming'], intervalMinutes: 5, eventCount: 0,
    positiveCount: 0, aboveThresholdCount: 0, freshPositiveCount: 0, opportunityCount: 0,
    minimumEdgePercent: 2, bookmakerCount: 9, coveredBookmakers: [], remaining: '99', used: '1'
  });
});

test('checks each configured sport and records which books actually returned prices', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const requested = [], logs = [];
  const monitor = createArbitragePaperMonitor({ apiKey: 'test',
    reviewChannel: { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => {} },
    stateFile: path.join(root, 'state.json'), sports: ['americanfootball_nfl', 'baseball_mlb'],
    fetchImpl: async url => {
      requested.push(url.pathname);
      const current = structuredClone(event);
      current.id = String(requested.length);
      current.sport_key = requested.length === 1 ? 'americanfootball_nfl' : 'baseball_mlb';
      current.bookmakers[0].markets[0].outcomes[0].price = 1.8;
      current.bookmakers[1].markets[0].outcomes[1].price = 1.8;
      return new Response(JSON.stringify([current]), { status: 200, headers: { 'x-requests-remaining': '98' } });
    }, now: () => new Date('2026-09-23T18:00:00Z'), windows: ['08:00-15:00'], log: message => logs.push(message) });
  await monitor.start();
  await monitor.stop();
  assert.deepEqual(requested, ['/v4/sports/americanfootball_nfl/odds', '/v4/sports/baseball_mlb/odds']);
  const receipt = JSON.parse(logs[0].replace(/^Arbitrage scan: /, ''));
  assert.equal(receipt.eventCount, 2);
  assert.deepEqual(receipt.coveredBookmakers, ['draftkings', 'fanduel']);
});

test('scan receipt separates a positive edge from threshold and quote-age filters', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const nearZero = structuredClone(event);
  nearZero.bookmakers[0].markets[0].outcomes[0].price = 2.01;
  nearZero.bookmakers[1].markets[0].outcomes[1].price = 2.01;
  const logs = [];
  const monitor = createArbitragePaperMonitor({ apiKey: 'test',
    reviewChannel: { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => {} },
    stateFile: path.join(root, 'state.json'),
    fetchImpl: async () => new Response(JSON.stringify([nearZero]), { status: 200 }),
    now: () => new Date('2026-09-23T18:00:00Z'), windows: ['08:00-15:00'],
    log: message => logs.push(message) });
  await monitor.start();
  await monitor.stop();
  const receipt = JSON.parse(logs[0].replace(/^Arbitrage scan: /, ''));
  assert.equal(receipt.positiveCount, 1);
  assert.equal(receipt.aboveThresholdCount, 0);
  assert.equal(receipt.opportunityCount, 0);
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

test('approval survives when the edge slips below the discovery threshold but remains positive', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const message = { id: 'review-message', edit: async () => {} };
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async () => message };
  const detected = structuredClone(event);
  const narrowed = structuredClone(event);
  narrowed.bookmakers[0].markets[0].outcomes = [{ name: 'Away', price: 2.03 }, { name: 'Home', price: 1.7 }];
  narrowed.bookmakers[1].markets[0].outcomes = [{ name: 'Away', price: 2.0 }, { name: 'Home', price: 2.03 }];
  let calls = 0;
  const fetchImpl = async () => new Response(JSON.stringify(calls++ === 0 ? [detected] : [narrowed]), {
    status: 200, headers: { 'x-requests-remaining': '490', 'x-requests-used': '10' }
  });
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, destinationChannel: null,
    stateFile: path.join(root, 'state.json'), fetchImpl, now: () => new Date('2026-09-23T18:00:00Z'),
    windows: ['08:00-15:00'], minimumEdgePercent: 2, memberPostingEnabled: false,
    isApprover: ({ userId }) => userId === 'kobe' });
  await monitor.start();
  const result = await monitor.decide({ customId: 'arbitrage-review:approve:game-1:h2h', userId: 'kobe',
    guildId: 'guild', channelId: 'review', message });
  await monitor.stop();
  assert.equal(result.status, 'DRY_RUN_APPROVED');
  assert.ok(monitor.snapshot().opportunities['game-1:h2h'].status === 'DRY_RUN_APPROVED');
});

test('a rediscovered opportunity gets a fresh card after the earlier card expired', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const stateFile = path.join(root, 'state.json');
  await fs.writeFile(stateFile, JSON.stringify({ scans: [], opportunities: {
    'game-1:h2h': { ...findArbitrage([event], { minimumEdgePercent: 2, bankroll: 1000 })[0], status: 'EXPIRED_15S', messageId: 'old', rechecks: [] }
  } }));
  const sends = [];
  const message = { id: 'new-review-message', edit: async () => {} };
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' }, send: async (payload) => { sends.push(payload); return message; } };
  const fetchImpl = async () => new Response(JSON.stringify([event]), { status: 200, headers: { 'x-requests-remaining': '490' } });
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, destinationChannel: null,
    stateFile, fetchImpl, now: () => new Date('2026-09-23T18:01:00Z'), windows: ['08:00-15:00'] });
  await monitor.start();
  await monitor.stop();
  assert.equal(sends.length, 1);
  assert.equal(monitor.snapshot().opportunities['game-1:h2h'].messageId, 'new-review-message');
  assert.equal(monitor.snapshot().opportunities['game-1:h2h'].status, 'DETECTED');
});

test('restart restores controls on existing expired approval cards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const stateFile = path.join(root, 'state.json');
  const opportunity = findArbitrage([event], { minimumEdgePercent: 2, bankroll: 1000 })[0];
  await fs.writeFile(stateFile, JSON.stringify({ scans: [], opportunities: {
    [opportunity.id]: { ...opportunity, status: 'EXPIRED_AT_APPROVAL', messageId: 'old-card', rechecks: [] }
  } }));
  const edits = [];
  const oldMessage = { edit: async (payload) => edits.push(payload) };
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' },
    messages: { fetch: async (id) => { assert.equal(id, 'old-card'); return oldMessage; } },
    send: async () => ({ id: 'fresh', edit: async () => {} }) };
  const fetchImpl = async () => new Response(JSON.stringify([]), { status: 200, headers: { 'x-requests-remaining': '490' } });
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, destinationChannel: null,
    stateFile, fetchImpl, now: () => new Date('2026-09-23T23:00:00Z'), windows: ['08:00-15:00'] });
  await monitor.start();
  await monitor.stop();
  assert.equal(edits.length, 1);
  assert.equal(edits[0].components[0].components[0].data.disabled, false);
  assert.doesNotMatch(edits[0].embeds[0].description, /paper test/i);
});

test('restart removes a deleted approval card from persistent state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-arbitrage-'));
  const stateFile = path.join(root, 'state.json');
  const opportunity = findArbitrage([event], { minimumEdgePercent: 2, bankroll: 1000 })[0];
  await fs.writeFile(stateFile, JSON.stringify({ scans: [], opportunities: {
    [opportunity.id]: { ...opportunity, status: 'EXPIRED_AT_APPROVAL', messageId: 'deleted-card', rechecks: [] }
  } }));
  const logs = [];
  const reviewChannel = { id: 'review', guildId: 'guild', guild: { ownerId: 'owner' },
    messages: { fetch: async () => { throw Object.assign(new Error('Unknown Message'), { code: 10008 }); } } };
  const monitor = createArbitragePaperMonitor({ apiKey: 'test', reviewChannel, stateFile,
    fetchImpl: async () => new Response('[]', { status: 200 }),
    now: () => new Date('2026-09-23T23:00:00Z'), windows: ['08:00-15:00'], log: message => logs.push(message) });
  await monitor.start();
  assert.deepEqual(monitor.snapshot().opportunities, {});
  assert.deepEqual(JSON.parse(await fs.readFile(stateFile, 'utf8')).opportunities, {});
  assert.match(logs[0], /Removed missing arbitrage approval card deleted-card/);
  await monitor.stop();
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
