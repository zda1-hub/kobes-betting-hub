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
