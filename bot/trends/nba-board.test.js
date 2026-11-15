'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const bdl = require('./bdl-nba');
const { researchNbaBoard, formatNbaBoard } = require('./nba-board');

const now = new Date('2026-11-15T02:00:00.000Z');
const event = { id: 'nba-game-1', home_team: 'Dallas Mavericks',
  away_team: 'Denver Nuggets', commence_time: '2026-11-15T03:00:00.000Z' };
const game = { datetime: event.commence_time,
  home_team: { id: 1, full_name: event.home_team },
  visitor_team: { id: 2, full_name: event.away_team } };

function offer(player, changes = {}) {
  return { player, market: 'player_points_alternate', side: 'over', line: 19.5,
    odds: -130, sportsbook: 'Example Book', sportsbookKey: 'example',
    updatedAt: now.toISOString(), ...changes };
}

function history() {
  const window = (hits, sample) => ({ hits, sample, hitRate: hits / sample });
  return { rightsUrl: bdl.TERMS_URL, sourceUrl: 'https://api.balldontlie.io/v1/stats',
    analysis: { season: window(18, 20), l5: window(5, 5),
      l10: window(9, 10), l20: window(18, 20) } };
}

function adapters(selections) {
  const calls = { odds: 0, history: 0 };
  return { calls,
    readEvents: async () => ({ data: [event] }),
    readOdds: async () => { calls.odds++; return { selections }; },
    readEvent: async () => game,
    readPlayer: async ({ name }) => ({ id: name, first_name: name,
      last_name: 'Test', team: { full_name: 'Dallas Mavericks' } }),
    readHistory: async () => { calls.history++; return history(); },
    readAvailability: async () => ({ status: 'active-roster-no-listed-injury',
      rightsUrl: bdl.TERMS_URL, checkedAt: now.toISOString() }),
    reserveOdds: async ({ operation, cost }) => { assert.ok(cost >= 1); return operation(); } };
}

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-nba-board-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('shows a fresh qualified exact alternate prop with source and caution', async t => {
  const root = await tempRoot(t);
  const source = adapters([offer('Verified Player')]);
  const board = await researchNbaBoard({ root, oddsKey: 'odds', bdlKey: 'bdl',
    team: 'Dallas', now, ...source });
  assert.equal(board.rows.length, 1);
  assert.equal(board.rows[0].player, 'Verified Player Test');
  assert.deepEqual(board.rows[0].l20, { hits: 18, sample: 20 });
  assert.equal(board.rows[0].odds, -130);
  assert.equal(source.calls.odds, 1);
  const text = formatNbaBoard(board);
  assert.match(text, /18\/20/);
  assert.match(text, /Participation is not confirmed/);
  assert.match(text, /Historical rates are not next-game probabilities/);
  assert.ok(text.length < 1900);
  const cached = await researchNbaBoard({ root, oddsKey: 'odds', bdlKey: 'bdl',
    team: 'Dallas', now: new Date(now.valueOf() + 20_000), ...source });
  assert.equal(cached.cached, true);
  assert.equal(source.calls.odds, 1);
});

test('excludes stale quotes and injury-listed candidates without a false row', async t => {
  const root = await tempRoot(t);
  const source = adapters([
    offer('Stale Player', { updatedAt: '2026-11-15T01:54:00.000Z' }),
    offer('Injured Player')
  ]);
  source.readAvailability = async () => ({ status: 'unconfirmed',
    reason: 'Player has an injury report entry' });
  const board = await researchNbaBoard({ root, oddsKey: 'odds', bdlKey: 'bdl',
    team: 'Dallas', now, ...source });
  assert.equal(board.checkedOffers, 1);
  assert.deepEqual(board.rows, []);
  assert.match(formatNbaBoard(board), /No qualifying current alternate props among 1 bounded candidates/);
});

test('caps long boards at six rows and keeps formatted response below Discord limit', async t => {
  const root = await tempRoot(t);
  const players = Array.from({ length: 10 }, (_, index) => offer(`Player${index}`,
    { market: index < 4 ? 'player_points_alternate' : index < 8 ?
      'player_rebounds_alternate' : 'player_assists_alternate' }));
  const source = adapters(players);
  const board = await researchNbaBoard({ root, oddsKey: 'odds', bdlKey: 'bdl',
    team: 'Dallas', now, ...source });
  assert.equal(board.rows.length, 6);
  assert.ok(formatNbaBoard(board).length < 1900);
});

test('empty provider market remains an honest no-rows research board', async t => {
  const root = await tempRoot(t);
  const source = adapters([]);
  const board = await researchNbaBoard({ root, oddsKey: 'odds', bdlKey: 'bdl',
    team: 'Dallas', now, ...source });
  assert.equal(board.checkedOffers, 0);
  assert.deepEqual(board.rows, []);
  assert.match(formatNbaBoard(board), /No qualifying current alternate props among 0 bounded candidates/);
});
