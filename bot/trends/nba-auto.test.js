'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { candidateOffers, featuredEvent, scanNbaAuto } = require('./nba-auto');

const now = new Date('2026-11-15T19:00:00Z');
const event = { id: 'event-12345678', home_team: 'Denver Nuggets', away_team: 'New Orleans Pelicans', commence_time: '2026-11-15T20:00:00Z' };

test('only a same-day 30–90 minute event is eligible and stale offers are discarded', () => {
  assert.equal(featuredEvent([event], now).id, event.id);
  assert.equal(featuredEvent([{ ...event, commence_time: '2026-11-16T20:00:00Z' }], now), null);
  const quote = { market: 'player_points_alternate', side: 'over', player: 'Yves Missi',
    line: 10.5, odds: -110, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() };
  assert.equal(candidateOffers([quote, { ...quote, updatedAt: '2026-11-15T18:54:00Z' }], now).length, 1);
});

test('qualified NBA candidate receives one durable daily publication receipt', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nba-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let sent = 0, marketCalls = 0;
  const count = (hits, sample) => ({ hits, sample, pushes: 0, hitRate: hits / sample });
  const args = { root, apiKey: 'fixture', channelId: '1571285528882450623', channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event] }),
    reserveOdds: async ({ operation }) => operation(),
    readOdds: async () => { marketCalls++; return { selections: [{ market: 'player_points_alternate', side: 'over',
      player: 'Yves Missi', line: 10.5, odds: -110, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() }] }; },
    readHistory: async () => ({ analysis: { season: count(9, 10), l5: count(5, 5),
      l10: count(9, 10), l20: count(17, 20) }, checkedAt: now.toISOString(), sourceUrl: 'https://example.com/records' }),
    verifyRoster: async () => ({ status: 'UPCOMING', athlete: { id: '123' }, playerTeam: event.away_team, eventStart: event.commence_time }),
    readAvailability: async () => ({ status: 'confirmed-active', sourceUrl: 'https://official.nba.com/report.pdf',
      checkedAt: now.toISOString(), sourceUpdatedAt: now.toISOString() }),
    publish: async () => { sent++; return { id: 'candidate', messageId: 'message-1' }; } };
  const first = await scanNbaAuto(args);
  const second = await scanNbaAuto(args);
  assert.equal(first.status, 'published');
  assert.equal(second.existing, true);
  assert.equal(sent, 1);
  assert.equal(marketCalls, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'trends-auto/nba-2026-11-15.json'), 'utf8')).messageId, 'message-1');
});

test('unconfirmed NBA status holds the entire scan without posting', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nba-hold-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let sent = 0;
  const result = await scanNbaAuto({ root, apiKey: 'fixture', channelId: '1571285528882450623', channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event] }), reserveOdds: async ({ operation }) => operation(),
    readOdds: async () => ({ selections: [{ market: 'player_points_alternate', side: 'over', player: 'Yves Missi',
      line: 10.5, odds: -110, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() }] }),
    readHistory: async () => ({ analysis: { season: { sample: 10, hitRate: 0.9 }, l20: { sample: 20 } } }),
    verifyRoster: async () => ({ status: 'UPCOMING', athlete: { id: '123' }, playerTeam: event.away_team, eventStart: event.commence_time }),
    readAvailability: async () => ({ status: 'unknown' }), publish: async () => { sent++; } });
  assert.equal(result.status, 'held');
  assert.equal(sent, 0);
});
