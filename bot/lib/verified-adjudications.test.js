const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewedAdjudication } = require('./verified-adjudications');
test('reviewed primary-source outcomes are bound to exact published identity, date and market', () => {
  const row = { pick_id: 'tg-20260917-3593544389-27786', operating_date: '2026-09-17', selection: 'Victoria Kasintseva ML' };
  assert.equal(reviewedAdjudication(row).result, 'L');
  for (const change of [{ pick_id: 'different' }, { operating_date: '2026-09-18' }, { selection: 'Victoria Kasintseva -1.5 Sets' }, { market: 'Set handicap' }]) {
    assert.equal(reviewedAdjudication({ ...row, ...change }), null);
  }
});

test('October 1 reviewed wagers settle only their exact published terms', () => {
  const evidence = require('../data/verified-2026-10-01.json');
  assert.equal(evidence.length, 25);
  for (const item of evidence) {
    const row = { pick_id: item.pickId, operating_date: item.date, selection: item.selection, market: item.market };
    assert.equal(reviewedAdjudication(row)?.result, item.result);
    assert.equal(reviewedAdjudication({ ...row, selection: `${item.selection} changed` }), null);
    assert.equal(reviewedAdjudication({ ...row, operating_date: '2026-10-02' }), null);
    assert.equal(reviewedAdjudication({ ...row, market: 'Different market' }), null);
  }
});
