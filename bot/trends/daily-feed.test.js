'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { feedMessages, fullL10Rows } = require('./daily-feed');

test('daily feed excludes a 1/1 or 8/8 sample from the L10 8/10 rule', () => {
  const rows = [1, 8, 10].map(sample => ({ analysis: { l10: { sample } } }));
  assert.deepEqual(fullL10Rows(rows), [rows[2]]);
});

test('private TEST feed is visibly labeled and includes all ten observed game values', () => {
  const row = { player: 'Test Player', teamAbbr: 'KC', opponentAbbr: 'ATL', sport: 'NFL',
    stat: 'passing_yards', threshold: 249.5, position: 'QB', rank: 5,
    rankTeams: 32, dataDate: '2026-11-15', analysis: { l10: { hits: 8, sample: 10,
      hitRate: 0.8, average: 280.2, games: Array.from({ length: 10 }, (_, i) =>
        ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, value: 270 + i })) } } };
  const messages = feedMessages([row], { test: true });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^\*\*TEST — NOT A PICK/);
  assert.match(messages[0], /L10 8\/10 · 80% · avg 280\.2/);
  assert.match(messages[0], /11-01 270[\s\S]*11-10 279/);
  assert.match(messages[0], /Data: nflverse \(CC BY 4\.0\)/);
  assert.match(messages[0], /Research only, not a guarantee$/);
});

test('college feed identifies unverified injuries and never invents book odds', () => {
  const row = { player: 'Test Player', teamAbbr: 'TEST',
    opponentAbbr: 'OTHER', sport: 'CBB', stat: 'points', threshold: 10.5,
    analysis: { l10: { hits: 8, sample: 10, hitRate: 0.8, average: 12,
      games: Array.from({ length: 10 }, (_, i) =>
        ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, value: 12 })) } } };
  const message = feedMessages([row], { test: true })[0];
  assert.match(message, /Calc line \(no book line\)/);
  assert.match(message, /Injury status not checked/);
  assert.match(message, /L10 8\/10/);
});
