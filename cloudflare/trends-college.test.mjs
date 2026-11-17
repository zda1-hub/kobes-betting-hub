import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./trends-college.js', import.meta.url), 'utf8');
const { normalizeCfb, normalizeCbb, reserveCollegeCall, dueCollegeRefresh,
  refreshDueCollege, refreshCollegeDay, refreshOneCbbBackfill, collegeUpstreamStatus } =
  await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('college refresh waits until 8 AM Pacific and skips off-season sports', () => {
  assert.equal(dueCollegeRefresh(new Date('2026-11-16T15:55:00Z')), null);
  assert.deepEqual(dueCollegeRefresh(new Date('2026-11-16T16:05:00Z')),
    { date: '2026-11-15', sports: ['cfb', 'cbb'] });
  assert.deepEqual(dueCollegeRefresh(new Date('2026-06-16T15:05:00Z')),
    { date: '2026-06-15', sports: [] });
});

test('missing college key never opens D1 or makes upstream calls', async () => {
  const result = await refreshDueCollege({ DB: { batch() { throw new Error('must not open DB'); } } },
    new Date('2026-11-16T16:05:00Z'),
    { fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.equal(result.status, 'key_missing');
});

test('college football final box scores keep observed values and team context', () => {
  const game = { id: 101, completed: true, home_team: 'A', away_team: 'B' };
  const box = { id: 101, teams: [{ team: 'A', categories: [
    { name: 'passing', types: [{ name: 'YDS', athletes: [
      { id: '7', name: 'Player', stat: '201' },
      { id: '-7034', name: ' Team', stat: '0' }
    ] }] },
    { name: 'rushing', types: [{ name: 'YDS', athletes: [{ id: '7', name: 'Player', stat: '40' }] }] },
    { name: 'receiving', types: [{ name: 'YDS', athletes: [{ id: '7', name: 'Player', stat: '12' }] }] }
  ] }] };
  assert.deepEqual(normalizeCfb(game, box)[0].stats, {
    passing_yards: 201, rushing_yards: 40, receiving_yards: 12, rush_receiving_yards: 52
  });
  assert.equal(normalizeCfb(game, box).length, 1);
  assert.deepEqual(normalizeCfb({ ...game, completed: false }, box), []);
});

test('college basketball final player rows compute PRA only from observed numbers', () => {
  // The official CBBD GamesBoxScorePlayers schema uses camelCase keys.
  const game = { id: 9, status: 'final', seasonType: 'regular', homeTeam: 'A', awayTeam: 'B' };
  const box = { gameId: 9, team: 'B', players: [
    { athleteId: 4, name: 'Player', minutes: 28, points: 18, rebounds: { total: 7 },
      assists: 3, threePointFieldGoals: { made: 2 } },
    { athleteId: 5, name: 'Missing', minutes: 30, points: 10, rebounds: { total: 5 },
      assists: null, threePointFieldGoals: { made: 1 } }
  ] };
  assert.deepEqual(normalizeCbb(game, box).map(row => row.stats),
    [{ points: 18, rebounds: 7, assists: 3, threes: 2, pra: 28,
      points_rebounds: 25, points_assists: 21, rebounds_assists: 10 }]);
  assert.equal(normalizeCbb(game, box)[0].location, 'away');
});

test('shared college budget refuses request 901 before the network', async () => {
  let calls = 899;
  const db = { prepare(sql) {
    return { bind() { return this; }, async run() {
      if (sql.startsWith('UPDATE')) {
        if (calls >= 900) return { meta: { changes: 0 } };
        calls++;
      }
      return { meta: { changes: 1 } };
    }, async first() { return { calls }; } };
  } };
  assert.equal((await reserveCollegeCall(db, new Date('2026-11-16'))).calls, 900);
  await assert.rejects(reserveCollegeCall(db, new Date('2026-11-16')), /900/);
});

test('upstream quota check reports only safe account usage fields', async () => {
  const db = { async batch() { return []; }, prepare() { return {
    bind() { return this; }, async run() { return { meta: { changes: 1 } }; },
    async first() { return { calls: 2 }; }
  }; } };
  const result = await collegeUpstreamStatus({ DB: db, CFBD_API_KEY: 'private-key' },
    new Date('2026-11-16'), async (url, options) => {
      assert.ok(['https://api.collegefootballdata.com/info',
        'https://api.collegebasketballdata.com/info'].includes(url));
      assert.equal(options.headers.authorization, 'Bearer private-key');
      return new Response(JSON.stringify({ tierName: 'Free', monthlyLimit: 1000,
        usedCalls: 1000, remainingCalls: 0, sharedPool: true,
        resetAt: '2026-12-01T00:00:00Z', credential: 'must-not-return' }));
    });
  assert.equal(result.remainingCalls, 0);
  assert.equal(result.credential, undefined);
  assert.equal(result.cbb.status, 200);
  assert.equal(result.cbb.credential, undefined);
});

test('CBB backfill selects one missing day and waits six hours before another', async () => {
  let attemptedAt = null;
  let calls = 0;
  const db = { async batch() { return []; }, prepare(sql) { return {
    bind(...args) { this.args = args; return this; },
    async first() {
      if (sql.includes('MAX(attempted_at)')) return { at: attemptedAt };
      if (sql.includes('SELECT calls')) return { calls };
      return null;
    },
    async all() { return { results: Array.from({ length: 6 }, (_, i) =>
      ({ game_date: `2026-11-${String(14 - i).padStart(2, '0')}` })) }; },
    async run() {
      if (sql.includes("'cbb_backfill'")) attemptedAt = this.args[1];
      if (sql.startsWith('UPDATE trends_college_usage')) calls++;
      return { meta: { changes: 1 } };
    }
  }; } };
  const now = new Date('2026-11-16T20:00:00Z');
  const fetchImpl = async () => new Response('[]');
  const first = await refreshOneCbbBackfill({ DB: db, CFBD_API_KEY: 'test-key' },
    '2026-11-15', { now, fetchImpl });
  assert.equal(first.date, '2026-11-08');
  assert.equal(first.backfill, true);
  assert.equal(calls, 2);
  assert.equal(await refreshOneCbbBackfill({ DB: db, CFBD_API_KEY: 'test-key' },
    '2026-11-15', { now: new Date(now.valueOf() + 3600_000), fetchImpl }), null);
  assert.equal(calls, 2);
});

test('a full CBB slate writes in batches instead of exhausting D1 subrequests', async () => {
  const batches = [];
  let calls = 0;
  const db = {
    prepare(sql) { return {
      sql, bind(...args) { this.args = args; return this; },
      async run() { if (sql.startsWith('UPDATE trends_college_usage')) calls++; return { meta: { changes: 1 } }; },
      async first() { return sql.includes('SELECT calls') ? { calls } : null; }
    }; },
    async batch(statements) { batches.push(statements.map(statement => statement.sql)); return []; }
  };
  const game = { id: 9, status: 'final', seasonType: 'regular', startDate: '2026-11-15T20:00:00Z',
    homeTeam: 'A', awayTeam: 'B', season: 2026 };
  const players = Array.from({ length: 150 }, (_, i) => ({ athleteId: i + 1,
    name: `Player ${i + 1}`, minutes: 20, points: 10, rebounds: { total: 4 },
    assists: 2, threePointFieldGoals: { made: 1 } }));
  const fetchImpl = async url => new Response(JSON.stringify(url.includes('/games/players?') ?
    [{ gameId: 9, team: 'A', players }] : [game]));
  const result = await refreshCollegeDay({ DB: db, CFBD_API_KEY: 'test-key' }, 'cbb', '2026-11-15',
    { now: new Date('2026-11-16T20:00:00Z'), fetchImpl });
  assert.equal(result.playerRows, 150);
  assert.equal(calls, 2);
  assert.deepEqual(batches.slice(1).map(batch => batch.length), [100, 51]);
});

test('CFB fetches one weekly box-score batch for multiple final games', async () => {
  let calls = 0;
  const db = {
    prepare(sql) { return {
      sql, bind() { return this; },
      async run() { if (sql.startsWith('UPDATE trends_college_usage')) calls++; return { meta: { changes: 1 } }; },
      async first() { return sql.includes('SELECT calls') ? { calls } : null; }
    }; },
    async batch() { return []; }
  };
  const games = [1, 2].map(id => ({ id, completed: true, seasonType: 'regular',
    startDate: '2026-11-15T20:00:00Z', homeTeam: `Home ${id}`,
    awayTeam: `Away ${id}`, season: 2026, week: 11 }));
  const boxes = [1, 2].map(id => ({ id, teams: [{ team: `Home ${id}`, categories: [
    { name: 'receiving', types: [{ name: 'yds', athletes: [
      { id: String(id), name: `Player ${id}`, stat: '56' }
    ] }] }
  ] }] }));
  const paths = [];
  const fetchImpl = async url => {
    paths.push(new URL(url).pathname + new URL(url).search);
    return new Response(JSON.stringify(url.includes('/games/players?') ? boxes : games));
  };
  const result = await refreshCollegeDay({ DB: db, CFBD_API_KEY: 'test-key' }, 'cfb', '2026-11-15',
    { now: new Date('2026-11-16T20:00:00Z'), fetchImpl });
  assert.equal(result.playerRows, 2);
  assert.equal(calls, 2);
  assert.match(paths[1], /week=11/);
});
