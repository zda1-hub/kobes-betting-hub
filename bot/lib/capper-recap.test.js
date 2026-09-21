const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCapperRecap } = require('./capper-recap');
const base = { operating_date: '2026-09-17', published_at: '2026-09-17T18:00:00Z', post_reference: 'https://discord.com/channels/1/2/3', status: 'GRADED', source_name: 'Codycoverspreads', result_verified_source: 'https://www.espn.com/game/1', wager_scope: 'individual' };
test('groups actual individual wagers by capper with requested record and symbols', () => {
  const rows = ['W', 'W', 'L', 'W'].map((result, i) => ({ ...base, pick_id: `test-${i}`, result, selection: ['Reds ML', 'Blues ML', 'Bills -3.5', 'Potters ML'][i] }));
  const recap = buildCapperRecap({ date: base.operating_date, rows });
  assert.match(recap.body, /Codycoverspreads 3-1💸\n\nReds ML ☘️\nBlues ML ☘️\nBills -3.5 💥\nPotters ML ☘️/);
  assert.equal(recap.pending, 0);
});
test('does not count pending, unverified or unexpanded group results as wins', () => {
  const rows = [{ ...base, pick_id: 'manual-20260917-aaaaaaaaaaaaaaaaaaaa', wager_scope: '', result: 'W', selection: 'Group' }, { ...base, pick_id: '2', result: 'P', selection: 'Push' }, { ...base, pick_id: '3', result: 'W', result_verified_source: '', selection: 'Unverified' }];
  const recap = buildCapperRecap({ date: base.operating_date, rows });
  assert.equal(recap.pending, 2);
  assert.match(recap.body, /0-0💸 \(1 push, 2 pending\)/);
  assert.match(recap.body, /NOT FINAL/);
  assert.match(recap.body, /Group ⏳/);
});

test('reposted identical selections count once in the capper record and retain every source receipt', () => {
  const plays = ['Vikings ML', 'Titans ML', 'Broncos ML', 'Commanders ML', 'Colts ML'];
  const rows = Array.from({ length: 3 }, (_, post) => plays.map((selection, index) => ({
    ...base, source_name: 'PORTER PICKS', pick_id: `${post}-${index}`, selection,
    result: index === 4 ? 'L' : 'W',
    post_reference: `https://discord.com/channels/1/2/${post + 3}`
  }))).flat();
  const recap = buildCapperRecap({ date: base.operating_date, rows });
  assert.equal(recap.total, 5);
  assert.equal(recap.reviews[0].total, 5);
  assert.equal(recap.reviews[0].includedPickIds.length, 15);
  assert.match(recap.body, /PORTER PICKS 4-1💸/);
  assert.match(recap.body, /10 identical reposted listings excluded/);
  assert.equal((recap.body.match(/Vikings ML ☘️/g) || []).length, 1);
});

test('conflicting verified grades for identical terms block approval instead of favoring a result', () => {
  const rows = [{ ...base, pick_id: 'first', selection: 'Vikings ML', result: 'W' },
    { ...base, pick_id: 'second', selection: 'Vikings ML', result: 'L' }];
  const recap = buildCapperRecap({ date: base.operating_date, rows });
  assert.equal(recap.pending, 1);
  assert.match(recap.body, /0-0💸 \(1 pending\)/);
  assert.match(recap.body, /Vikings ML ⏳/);
  assert.doesNotMatch(recap.body, /1-0💸|0-1💸/);
});

test('same selection with changed odds remains a distinct published wager', () => {
  const rows = [{ ...base, pick_id: 'first', selection: 'Vikings ML', published_odds_american: '-110', result: 'W' },
    { ...base, pick_id: 'second', selection: 'Vikings ML', published_odds_american: '+105', result: 'W' }];
  const recap = buildCapperRecap({ date: base.operating_date, rows });
  assert.equal(recap.total, 2);
  assert.match(recap.body, /2-0💸/);
});
