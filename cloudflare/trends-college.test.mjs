import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./trends-college.js', import.meta.url), 'utf8');
const { normalizeCfb, normalizeCbb, reserveCollegeCall, dueCollegeRefresh,
  refreshDueCollege } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

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
    { name: 'passing', types: [{ name: 'YDS', athletes: [{ id: '7', name: 'Player', stat: '201' }] }] },
    { name: 'rushing', types: [{ name: 'YDS', athletes: [{ id: '7', name: 'Player', stat: '40' }] }] },
    { name: 'receiving', types: [{ name: 'YDS', athletes: [{ id: '7', name: 'Player', stat: '12' }] }] }
  ] }] };
  assert.deepEqual(normalizeCfb(game, box)[0].stats, {
    passing_yards: 201, rushing_yards: 40, receiving_yards: 12, rush_receiving_yards: 52
  });
  assert.deepEqual(normalizeCfb({ ...game, completed: false }, box), []);
});

test('college basketball final player rows compute PRA only from observed numbers', () => {
  const game = { id: 9, status: 'final', home_team: 'A', away_team: 'B' };
  const box = { game_id: 9, team: 'B', players: [
    { athlete_id: 4, name: 'Player', minutes: 28, points: 18, rebounds: { total: 7 },
      assists: 3, three_point_field_goals: { made: 2 } },
    { athlete_id: 5, name: 'Missing', minutes: 30, points: 10, rebounds: { total: 5 },
      assists: null, three_point_field_goals: { made: 1 } }
  ] };
  assert.deepEqual(normalizeCbb(game, box).map(row => row.stats),
    [{ points: 18, rebounds: 7, assists: 3, threes: 2, pra: 28 }]);
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
