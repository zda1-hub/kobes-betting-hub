const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicResults } = require('./public-results');

const row = (id, result, extra = {}) => ({
  pick_id: id, operating_date: '2026-09-24', published_at: `2026-09-24T1${id}:00:00Z`,
  post_reference: `https://discord.com/channels/1/2/${id}`, status: result === 'PENDING' ? 'PUBLISHED' : 'GRADED',
  result, sport: 'NFL', selection: `Pick ${id}`, published_line: '+3.5', published_odds_american: '-110',
  result_verified_source: result === 'PENDING' ? '' : 'https://www.espn.com/game/1',
  result_verified_at: result === 'PENDING' ? '' : '2026-09-24T23:00:00Z', ...extra,
});

test('public results include every verified published outcome and keep pending separate', () => {
  const snapshot = buildPublicResults([row('1', 'W'), row('2', 'L'), row('3', 'P'), row('4', 'V'), row('5', 'PENDING'), row('6', 'W', { published_at: '' })], '2026-09-24', new Date('2026-09-25T01:00:00Z'));
  assert.deepEqual(snapshot.overall, { wins: 1, losses: 1, pushes: 1, voids: 1 });
  assert.equal(snapshot.pending, 1);
  assert.equal(snapshot.settled, 4);
  assert.deepEqual(snapshot.recent.map((item) => item.result).sort(), ['L', 'P', 'V', 'W']);
});
