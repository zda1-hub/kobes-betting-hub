'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { scanNbaPopular } = require('./nba-popular-auto');

const now = new Date('2026-11-15T19:00:00Z');
const startsAt = '2026-11-15T20:00:00Z';
const combo = { id: 'abc123', distinctSearchers: 5, legs: [
  { sport: 'NBA', team: 'denver nuggets', player: 'Nikola Jokic', stat: 'points', side: 'over', line: 19.5 },
  { sport: 'NBA', team: 'new orleans pelicans', player: 'Yves Missi', stat: 'rebounds', side: 'over', line: 5.5 }
] };
const event = { id: 'event-12345678', home_team: 'Denver Nuggets',
  away_team: 'New Orleans Pelicans', commence_time: startsAt };
function research(leg) {
  const count = (hits, sample) => ({ hits, sample, hitRate: hits / sample });
  return { player: leg.player, side: leg.side, stat: leg.stat, line: leg.line,
    eventId: event.id, leagueStartsAt: startsAt,
    offers: [{ sportsbook: 'Book', sportsbookKey: 'book', odds: -150, updatedAt: now.toISOString() }],
    analysis: { season: count(9, 10), l20: count(18, 20) },
    historySource: 'https://api.balldontlie.io/v1/stats', historyCheckedAt: now.toISOString(),
    availability: { status: 'active-roster-no-listed-injury', checkedAt: now.toISOString() } };
}

test('five real exact-combination requests publish once with no invented parlay payout', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nba-popular-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let sent = 0;
  const args = { root, oddsKey: 'odds-test', bdlKey: 'bdl-test', now,
    channelId: '1571283801592827945',
    channelFor: async id => ({ id, isTextBased: () => true, send: async message => {
      sent++;
      assert.match(message.content, /5 distinct KBH searchers/);
      assert.match(message.content, /No combined price/);
      return { id: 'message-123' };
    } }),
    readCombos: async () => ({ combos: [combo] }),
    readEvents: async () => ({ data: [event] }),
    research: async query => research(query)
  };
  const first = await scanNbaPopular(args);
  const second = await scanNbaPopular(args);
  assert.equal(first.status, 'published');
  assert.equal(second.existing, true);
  assert.equal(sent, 1);
});

test('unmeasured combination makes no odds calls or Discord post', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nba-popular-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  const result = await scanNbaPopular({ root, oddsKey: 'a', bdlKey: 'b', now,
    channelId: '1571283801592827945', channelFor: async () => { calls++; },
    readCombos: async () => ({ combos: [] }), readEvents: async () => ({ data: [event] }),
    research: async () => { calls++; } });
  assert.equal(result.status, 'waiting');
  assert.equal(calls, 0);
});
