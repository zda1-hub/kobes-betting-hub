'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { completeCfbSample } = require('./college-coverage');

const rows = Array.from({ length: 10 }, (_, i) => [
  { gameId: String(i), date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    status: 'final', participated: true, playerId: 'teammate', stats: { receptions: 1 } },
  { gameId: String(i), date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    status: 'final', participated: true, playerId: 'target', stats: { receptions: i } }
]).flat();

test('CFB sample needs an explicit player stat in every recent team game', () => {
  assert.equal(completeCfbSample(rows, 'target', 'receptions'), true);
  assert.equal(completeCfbSample(rows.filter(row => !(row.playerId === 'target' && row.gameId === '9')),
    'target', 'receptions'), false);
  assert.equal(completeCfbSample(rows.map(row => row.playerId === 'target' && row.gameId === '9'
    ? { ...row, stats: {} } : row), 'target', 'receptions'), false);
  assert.equal(completeCfbSample(rows.filter(row => Number(row.gameId) < 5),
    'target', 'receptions'), false);
  assert.equal(completeCfbSample(rows.filter(row => Number(row.gameId) < 6),
    'target', 'receptions'), true);
});
