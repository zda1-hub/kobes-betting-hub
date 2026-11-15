'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MARKETS, candidateOffers, featuredEvent, scanNbaAuto } = require('./nba-auto');

const now = new Date('2026-11-15T19:00:00Z');
const event = { id: 'event-12345678', home_team: 'Denver Nuggets', away_team: 'New Orleans Pelicans', commence_time: '2026-11-15T20:00:00Z' };

test('only a same-day 30–90 minute event is eligible and stale offers are discarded', () => {
  assert.equal(featuredEvent([event], now).id, event.id);
  assert.equal(featuredEvent([{ ...event, commence_time: '2026-11-16T20:00:00Z' }], now), null);
  const quote = { market: 'player_points_alternate', side: 'over', player: 'Yves Missi',
    line: 10.5, odds: -110, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() };
  assert.equal(candidateOffers([quote, { ...quote, updatedAt: '2026-11-15T18:54:00Z' }], now).length, 1);
  assert.equal(MARKETS.length, 3);
  assert.deepEqual(candidateOffers([{ ...quote, market: 'player_rebounds_alternate' },
    { ...quote, market: 'player_assists_alternate' }], now).map(row => row.market),
  ['player_rebounds_alternate', 'player_assists_alternate']);
});

test('qualified NBA candidate receives one durable daily publication receipt', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nba-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let sent = 0, marketCalls = 0;
  const count = (hits, sample) => ({ hits, sample, pushes: 0, hitRate: hits / sample });
  const args = { root, apiKey: 'fixture', bdlKey: 'fixture', channelId: '1571285528882450623', channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event] }),
    reserveOdds: async ({ operation }) => operation(),
    readOdds: async () => { marketCalls++; return { selections: [{ market: 'player_points_alternate', side: 'over',
      player: 'Yves Missi', line: 10.5, odds: -110, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() }] }; },
    readBdlEvent: async () => ({ id: 123, datetime: event.commence_time, home_team: { id: 7, full_name: event.home_team },
      visitor_team: { id: 18, full_name: event.away_team } }),
    readPlayer: async () => ({ id: 1, team: { id: 18, full_name: event.away_team } }),
    readHistory: async () => ({ analysis: { season: count(9, 10), l5: count(5, 5),
      l10: count(9, 10), l20: count(17, 20) }, checkedAt: now.toISOString(), sourceUrl: 'https://example.com/records',
      rightsUrl: 'https://www.balldontlie.io/terms.html' }),
    readAvailability: async () => ({ status: 'active-roster-no-listed-injury',
      sourceUrl: 'https://api.balldontlie.io/v1/player_injuries', checkedAt: now.toISOString(),
      rightsUrl: 'https://www.balldontlie.io/terms.html' }),
    publish: async () => { sent++; return { id: 'candidate', messageId: 'message-1' }; } };
  const first = await scanNbaAuto(args);
  const second = await scanNbaAuto(args);
  assert.equal(first.status, 'published');
  assert.equal(second.existing, true);
  assert.equal(sent, 1);
  assert.equal(marketCalls, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, `trends-auto/nba-2026-11-15-${event.id}.json`), 'utf8')).messageId, 'message-1');
});

test('rebound and assist markets use their own completed-game statistic', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nba-stats-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const seen = [];
  const count = (hits, sample) => ({ hits, sample, pushes: 0, hitRate: hits / sample });
  const result = await scanNbaAuto({ root, apiKey: 'fixture', bdlKey: 'fixture',
    channelId: '1571285528882450623', channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event] }),
    reserveOdds: async ({ cost, operation }) => { assert.equal(cost, 3); return operation(); },
    readOdds: async () => ({ selections: ['player_rebounds_alternate', 'player_assists_alternate']
      .map(market => ({ market, side: 'over', player: 'Yves Missi', line: 5.5,
        odds: -150, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() })) }),
    readBdlEvent: async () => ({ id: 123, datetime: event.commence_time,
      home_team: { id: 7, full_name: event.home_team },
      visitor_team: { id: 18, full_name: event.away_team } }),
    readPlayer: async () => ({ id: 1, team: { id: 18, full_name: event.away_team } }),
    readHistory: async ({ stat }) => { seen.push(stat); return { analysis: {
      season: count(9, 10), l5: count(5, 5), l10: count(9, 10), l20: count(17, 20) },
      checkedAt: now.toISOString(), sourceUrl: 'https://example.com/records',
      rightsUrl: 'https://www.balldontlie.io/terms.html' }; },
    readAvailability: async () => ({ status: 'active-roster-no-listed-injury',
      sourceUrl: 'https://api.balldontlie.io/v1/player_injuries', checkedAt: now.toISOString(),
      rightsUrl: 'https://www.balldontlie.io/terms.html' }),
    publish: async ({ candidate }) => { seen.push(candidate.prop.stat); return { id: 'candidate', messageId: 'message-1' }; }
  });
  assert.equal(result.status, 'published');
  assert.deepEqual(seen, ['rebounds', 'rebounds']);
});

test('unconfirmed NBA status holds the entire scan without posting', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nba-hold-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let sent = 0;
  const result = await scanNbaAuto({ root, apiKey: 'fixture', bdlKey: 'fixture', channelId: '1571285528882450623', channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event] }), reserveOdds: async ({ operation }) => operation(),
    readOdds: async () => ({ selections: [{ market: 'player_points_alternate', side: 'over', player: 'Yves Missi',
      line: 10.5, odds: -110, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() }] }),
    readBdlEvent: async () => ({ id: 123, datetime: event.commence_time, home_team: { id: 7, full_name: event.home_team },
      visitor_team: { id: 18, full_name: event.away_team } }),
    readPlayer: async () => ({ id: 1, team: { id: 18, full_name: event.away_team } }),
    readHistory: async () => ({ analysis: { season: { sample: 10, hitRate: 0.9 }, l20: { sample: 20 } },
      rightsUrl: 'https://www.balldontlie.io/terms.html' }),
    readAvailability: async () => ({ status: 'unknown' }), publish: async () => { sent++; } });
  assert.equal(result.status, 'held');
  assert.equal(sent, 0);
});

test('a held first game does not block a later same-day game', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nba-next-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const later = { ...event, id: 'event-87654321', commence_time: '2026-11-15T20:20:00Z' };
  const scanned = [];
  const args = { root, apiKey: 'fixture', bdlKey: 'fixture', channelId: '1571285528882450623',
    channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event, later] }),
    reserveOdds: async ({ operation }) => operation(),
    readOdds: async (_sport, id) => { scanned.push(id); return { selections: [] }; },
    readBdlEvent: async () => ({ id: 123, datetime: event.commence_time, home_team: { id: 7 }, visitor_team: { id: 18 } }) };
  assert.equal((await scanNbaAuto(args)).status, 'held');
  assert.equal((await scanNbaAuto(args)).status, 'held');
  assert.deepEqual(scanned, [event.id, later.id]);
});
