'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { exactScheduledGame, candidateOffers, verifiedAvailability, scanNflAuto } = require('./nfl-auto');

const now = new Date('2026-11-15T17:00:00Z');
const event = { id: 'nfl-event-12345', home_team: 'New York Giants', away_team: 'Green Bay Packers',
  commence_time: '2026-11-15T18:00:00Z' };
const scheduleCsv = 'season,game_type,game_id,gameday,week,home_team,away_team,home_score,away_score\n' +
  '2026,REG,2026_10_GB_NYG,2026-11-15,10,NYG,GB,,\n' +
  [2026, 2025].flatMap(season => Array.from({ length: season === 2026 ? 8 : 12 }, (_, i) =>
    `${season},REG,${season}_${i + 1}_GB_CHI,${season}-09-${String(i + 1).padStart(2, '0')},${i + 1},CHI,GB,17,27`)).join('\n') + '\n';
const stats = (season, count, weekStart) => 'season,season_type,player_id,player_display_name,game_id,week,team,opponent_team,receptions,receiving_yards,rushing_yards\n' +
  Array.from({ length: count }, (_, i) => `${season},REG,p1,Sample Player,${season}_${weekStart + i}_GB_CHI,${weekStart + i},GB,CHI,5,55,10`).join('\n') + '\n';
const context = { rosters: [{ season: '2026', gsis_id: 'p1', team: 'GB', week: '10', status: 'ACT' }],
  injuries: [{ season: '2026', gsis_id: 'other', team: 'GB', week: '10', report_status: 'Questionable' }],
  rosterUpdatedAt: '2026-11-15T12:00:00Z', injuryUpdatedAt: '2026-11-15T12:00:00Z',
  rosterUrl: 'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv',
  injuryUrl: 'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv' };

test('NFL schedule joins exact game and odds only while fresh', () => {
  assert.equal(exactScheduledGame(scheduleCsv, event).week, 10);
  assert.throws(() => exactScheduledGame(scheduleCsv, { ...event, away_team: 'Chicago Bears' }), /does not match/);
  const quote = { market: 'player_receptions_alternate', side: 'over', player: 'Sample Player',
    line: 3.5, odds: -150, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() };
  assert.equal(candidateOffers([quote, { ...quote, updatedAt: '2026-11-15T16:54:00Z' }], now).length, 1);
});

test('NFL game-week roster and injury checks fail closed', () => {
  assert.equal(verifiedAvailability(context, { season: 2026, week: 10, playerId: 'p1', team: 'GB', now }).status,
    'active-roster-no-listed-injury');
  assert.throws(() => verifiedAvailability(context, { season: 2026, week: 10, playerId: 'p1', team: 'NYG', now }), /active roster/);
  assert.throws(() => verifiedAvailability({ ...context, injuries: [{ ...context.injuries[0], gsis_id: 'p1' }] },
    { season: 2026, week: 10, playerId: 'p1', team: 'GB', now }), /injury report/);
  assert.throws(() => verifiedAvailability({ ...context, injuryUpdatedAt: '2026-11-13T00:00:00Z' },
    { season: 2026, week: 10, playerId: 'p1', team: 'GB', now }), /stale/);
});

test('NFL scanner sends one candidate with durable event receipt and never retries uncertain send', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-nfl-auto-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const quote = { market: 'player_receptions_alternate', side: 'over', player: 'Sample Player',
    line: 3.5, odds: -150, sportsbook: 'Book', sportsbookKey: 'book', updatedAt: now.toISOString() };
  let sent = 0;
  const args = { root, apiKey: 'fixture', channelId: '1571285528882450623', channelFor: async () => ({}), now,
    readEvents: async () => ({ data: [event] }),
    reserveOdds: async ({ cost, operation }) => { assert.equal(cost, 3); return operation(); },
    readOdds: async () => ({ selections: [quote] }),
    readNfl: async ({ season }) => ({ scheduleCsv,
      statsCsv: stats(season, season === 2026 ? 8 : 12, 1),
      players: new Map([['p1', 'Sample Player']]) }), readContext: async () => context,
    publish: async ({ candidate }) => {
      assert.equal(candidate.prop.teamId, 'Green Bay Packers');
      assert.equal(candidate.analysis.season.sample, 8);
      assert.equal(candidate.analysis.l20.sample, 20);
      sent++; return { id: 'candidate-1', messageId: 'message-1' };
    } };
  const first = await scanNflAuto(args);
  assert.equal(first.status, 'published', JSON.stringify(first));
  assert.equal(sent, 1);
  assert.equal((await scanNflAuto(args)).status, 'waiting');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, `trends-auto/nfl-2026-11-15-${event.id}.json`), 'utf8')).messageId,
    'message-1');
});
