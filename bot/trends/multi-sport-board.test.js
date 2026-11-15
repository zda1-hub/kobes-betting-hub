'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { researchMultiSportBoard, formatMultiSportBoard,
  candidateOffers } = require('./multi-sport-board');

const now = new Date('2026-11-15T19:00:00.000Z');
const event = { id: 'sample-nfl-1', home_team: 'Buffalo Bills',
  away_team: 'Kansas City Chiefs', commence_time: '2026-11-15T21:00:00.000Z' };
const score = (hits, sample) => ({ hits, sample, hitRate: hits / sample });
const analysis = { season: score(8, 9), l5: score(4, 5),
  l10: score(8, 9), l20: score(8, 9) };
const quote = (player, changes = {}) => ({ player, market: 'player_receptions_alternate',
  side: 'over', line: 3.5, odds: -175, sportsbook: 'Example Book',
  sportsbookKey: 'example', updatedAt: now.toISOString(), ...changes });

async function rootFor(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-multi-board-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function adapters(selections, source = {}) {
  const calls = { odds: 0, history: 0 };
  return { calls,
    readEvents: async () => ({ data: [event] }),
    readOdds: async () => { calls.odds++; return { selections }; },
    readNfl: async ({ player }) => { calls.history++; return {
      player, analysis, sourceUrl: 'https://github.com/nflverse/nflverse-data',
      fetchedAt: now.toISOString(), ...source }; },
    readFree: async ({ name }) => { calls.history++; return {
      name, analysis: { ...analysis, season: score(18, 20),
        l20: score(18, 20) }, sourceUrl: 'https://github.com/sportsdataverse/sportsdataverse-data',
      checkedAt: now.toISOString(), ...source }; },
    reserveOdds: async ({ operation, cost }) => {
      assert.ok(cost >= 1 && cost <= 3); return operation();
    } };
}

test('NFL board displays only exact fresh quoted rows and sourced counts', async t => {
  const root = await rootFor(t);
  const provider = adapters([quote('Sample Player')]);
  const board = await researchMultiSportBoard({ root, oddsKey: 'key',
    sport: 'NFL', team: 'Bills', stat: 'receptions', now, ...provider });
  assert.equal(board.rows.length, 1);
  assert.equal(board.rows[0].line, 3.5);
  assert.equal(board.rows[0].odds, -175);
  assert.equal(provider.calls.odds, 1);
  const text = formatMultiSportBoard(board);
  assert.match(text, /8\/9/);
  assert.match(text, /Player participation is not confirmed/);
  assert.match(text, /Research only, not approved picks/);
  assert.ok(text.length < 1900);
  const cached = await researchMultiSportBoard({ root, oddsKey: 'key',
    sport: 'NFL', team: 'Bills', stat: 'receptions',
    now: new Date(now.valueOf() + 20_000), ...provider });
  assert.equal(cached.cached, true);
  assert.equal(provider.calls.odds, 1);
});

test('stale quotes and unmatched player identity never become rows', async t => {
  const root = await rootFor(t);
  const provider = adapters([quote('Stale Player', {
    updatedAt: new Date(now.valueOf() - 6 * 60_000).toISOString() }),
  quote('Current Player')], { player: 'Different Player' });
  const board = await researchMultiSportBoard({ root, oddsKey: 'key',
    sport: 'NFL', team: 'Bills', now, ...provider });
  assert.equal(board.checkedOffers, 1);
  assert.deepEqual(board.rows, []);
  assert.match(formatMultiSportBoard(board), /No qualifying current alternate props/);
});

test('NHL board can combine one event-scoped odds request with free completed-game counts', async t => {
  const root = await rootFor(t);
  const hockeyEvent = { ...event, id: 'sample-nhl-1',
    home_team: 'New York Rangers', away_team: 'Boston Bruins' };
  const provider = adapters([quote('Sample Skater', {
    market: 'player_shots_on_goal_alternate', line: 2.5 })]);
  provider.readEvents = async () => ({ data: [hockeyEvent] });
  const board = await researchMultiSportBoard({ root, oddsKey: 'key',
    sport: 'NHL', team: 'Rangers', stat: 'shots_on_goal', now, ...provider });
  assert.equal(board.rows.length, 1);
  assert.equal(board.rows[0].season.sample, 20);
  assert.equal(board.publicationEligible, false);
});

test('MLB board uses only the supported batter hits market and remains private research', async t => {
  const root = await rootFor(t);
  const baseballEvent = { ...event, id: 'sample-mlb-1',
    home_team: 'New York Yankees', away_team: 'Boston Red Sox' };
  const provider = adapters([quote('Sample Batter', {
    market: 'batter_hits_alternate', line: 0.5 })]);
  provider.readEvents = async () => ({ data: [baseballEvent] });
  const board = await researchMultiSportBoard({ root, oddsKey: 'key',
    sport: 'MLB', team: 'Yankees', stat: 'hits', now, ...provider });
  assert.equal(board.rows.length, 1);
  assert.equal(board.rows[0].stat, 'hits');
  assert.equal(board.publicationEligible, false);
  assert.match(formatMultiSportBoard(board), /Player participation is not confirmed/);
});

test('candidate selection rejects old odds, bad markets, and duplicate books', () => {
  const rows = candidateOffers([
    quote('Sample Player'), quote('Sample Player', { odds: -150 }),
    quote('Old Player', { updatedAt: new Date(now.valueOf() - 6 * 60_000).toISOString() }),
    quote('Wrong Market', { market: 'player_points_alternate' })
  ], 'NFL', ['player_receptions_alternate'], now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].odds, -150);
});
