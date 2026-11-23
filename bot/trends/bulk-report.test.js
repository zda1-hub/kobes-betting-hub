'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResult, formatReport, calcLine } = require('./bulk-report');

function logs(values) {
  return values.map((value, index) => ({ gameId: String(index + 1),
    date: `2026-11-${String(index + 1).padStart(2, '0')}`, season: '2026',
    status: 'final', participated: true, stats: { points: value } }));
}

test('calculated thresholds are labeled and window denominators reflect observed games', () => {
  const games = logs([12, 12, 12, 13, 13, 14]);
  assert.equal(calcLine(games, 'points'), 11.5);
  const result = buildResult({ sport: 'NBA', player: 'Test Player', teamAbbr: 'BOS',
    teamName: 'Celtics', opponentAbbr: 'NYK', stat: 'points', logs: games });
  assert.match(result.block, /Calc line \(no book line\)/);
  assert.match(result.block, /L5- 5\/5 ☘️  L10- 6\/6 ☘️  L20- 6\/6 ☘️/);
  assert.match(result.block, /Season avg: 12\.7 Pts \(6 games\)/);
  assert.match(result.block, /Opposing team Pts rank: N\/A/);
  assert.match(result.block, /Opposing team rank vs position N\/A: N\/A/);
  assert.doesNotMatch(result.block, /-\d{3}/);
});

test('private report shows team and positional matchup ranks separately', () => {
  const result = buildResult({ sport: 'NBA', player: 'Test Player', teamAbbr: 'BOS',
    teamName: 'Celtics', opponentAbbr: 'NYK', position: 'PG', stat: 'points',
    logs: logs([12, 12, 12, 13, 13, 14]), opponentRank: 3,
    opponentOverRank: 28, opponentTeamRank: 30, rankTeams: 30,
    dataDate: '2026-11-15' });
  assert.match(result.block, /Opposing team Pts rank: #30 of 30 \(more allowed\)/);
  assert.match(result.block, /Opposing team rank vs PG: #28 of 30 \(more allowed\) · data 2026-11-15/);
  assert.equal(result.rank, 3, 'existing channel-feed rank stays in its original direction');
});

test('DNP rows never enter denominators and low-hit props are excluded', () => {
  const games = logs([2, 2, 2, 2, 2]);
  games.push({ gameId: 'dnp', date: '2026-11-06', status: 'final', participated: false,
    stats: { points: 100 } });
  assert.equal(buildResult({ sport: 'NBA', player: 'P', teamAbbr: 'BOS', stat: 'points',
    logs: games, line: 10.5 }), null);
});

test('five observed games plus DNP are omitted; six observed games qualify', () => {
  const five = logs([12, 12, 12, 12, 12]);
  five.push({ gameId: 'dnp', date: '2026-11-06', status: 'final',
    participated: false, stats: { points: 100 } });
  const args = { sport: 'NBA', player: 'P', teamAbbr: 'BOS', stat: 'points', line: 11.5 };
  assert.equal(buildResult({ ...args, logs: five }), null);
  const six = [...five, ...logs([12]).map(row => ({ ...row, gameId: 'six', date: '2026-11-07' }))];
  const result = buildResult({ ...args, logs: six });
  assert.ok(result);
  assert.equal(result.analysis.l20.sample, 6);
  assert.match(result.block, /L10- 6\/6/);
  assert.match(result.block, /Season avg: 12\.0 Pts \(6 games\)/);
});

test('season average excludes DNPs and games without the selected stat', () => {
  const games = logs([10, 20, 30, 40, 50, 60]);
  games.push({ gameId: 'dnp', date: '2026-11-07', season: '2026',
    status: 'final', participated: false, stats: { points: 1000 } });
  games.push({ gameId: 'missing', date: '2026-11-08', season: '2026',
    status: 'final', participated: true, stats: {} });
  const result = buildResult({ sport: 'NBA', player: 'P', teamAbbr: 'BOS',
    stat: 'points', logs: games, line: 9.5 });
  assert.match(result.block, /Season avg: 35\.0 Pts \(6 games\)/);
});

test('one DM includes grouped results and footer; long reports split only at blocks', () => {
  const row = buildResult({ sport: 'NBA', player: 'Test Player', teamAbbr: 'BOS',
    stat: 'points', logs: logs([12, 12, 12, 13, 13, 14]) });
  const chunks = formatReport([row]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /\*\*NBA\*\*[\s\S]*\*\*BOS\*\*/);
  assert.match(chunks[0], /Research only, not a guarantee$/);
});
