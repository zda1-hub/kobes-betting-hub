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
  const games = logs([12, 12, 12, 13]);
  assert.equal(calcLine(games, 'points'), 11.5);
  const result = buildResult({ sport: 'NBA', player: 'Test Player', teamAbbr: 'BOS',
    teamName: 'Celtics', opponentAbbr: 'NYK', stat: 'points', logs: games });
  assert.match(result.block, /Calc line \(no book line\)/);
  assert.match(result.block, /L5- 4\/4 ☘️  L10- 4\/4 ☘️  L20- 4\/4 ☘️/);
  assert.match(result.block, /Opp rank vs position N\/A in Pts: N\/A/);
  assert.doesNotMatch(result.block, /-\d{3}/);
});

test('DNP rows never enter denominators and low-hit props are excluded', () => {
  const games = logs([2, 2, 2, 2, 2]);
  games.push({ gameId: 'dnp', date: '2026-11-06', status: 'final', participated: false,
    stats: { points: 100 } });
  assert.equal(buildResult({ sport: 'NBA', player: 'P', teamAbbr: 'BOS', stat: 'points',
    logs: games, line: 10.5 }), null);
});

test('one DM includes grouped results and footer; long reports split only at blocks', () => {
  const row = buildResult({ sport: 'NBA', player: 'Test Player', teamAbbr: 'BOS',
    stat: 'points', logs: logs([12, 12, 12, 13]) });
  const chunks = formatReport([row]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /\*\*NBA\*\*[\s\S]*\*\*BOS\*\*/);
  assert.match(chunks[0], /21\+ \| Research only, not a guarantee$/);
});
