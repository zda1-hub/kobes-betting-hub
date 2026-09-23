const test = require('node:test');
const assert = require('node:assert/strict');
const { nearEvenAmericanOdds, assertWriteupOdds } = require('./writeup-odds');

test('accepts source-stated near-even prices and rejects heavy favorites or missing prices', () => {
  for (const odds of ['-200', '-135', '-125', '-110', '+100', '+125', '+200', '−135']) assert.equal(nearEvenAmericanOdds(odds), true);
  for (const odds of ['-309', '-201', '+201', '-95', '', null]) assert.equal(nearEvenAmericanOdds(odds), false);
});

test('every play in a writeup must have eligible odds', () => {
  assert.doesNotThrow(() => assertWriteupOdds({ analysis: { extraction: { odds_american: '-110' } } }));
  assert.doesNotThrow(() => assertWriteupOdds({ analysis: { extraction: { odds_american: '-135' } } }));
  assert.throws(() => assertWriteupOdds({ analysis: { extraction: { plays: [{ odds_american: '-110' }, { odds_american: '-201' }] } } }), /between -200 and \+200/);
});
