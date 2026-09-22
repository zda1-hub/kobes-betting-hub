const test = require('node:test');
const assert = require('node:assert/strict');
const { nearEvenAmericanOdds, assertWriteupOdds } = require('./writeup-odds');

test('accepts source-stated near-even prices and rejects heavy favorites or missing prices', () => {
  for (const odds of ['-125', '-110', '+100', '+115', '+125', '−110']) assert.equal(nearEvenAmericanOdds(odds), true);
  for (const odds of ['-309', '-130', '+130', '-95', '', null]) assert.equal(nearEvenAmericanOdds(odds), false);
});

test('every play in a writeup must have eligible odds', () => {
  assert.doesNotThrow(() => assertWriteupOdds({ analysis: { extraction: { odds_american: '-110' } } }));
  assert.throws(() => assertWriteupOdds({ analysis: { extraction: { plays: [{ odds_american: '-110' }, { odds_american: '-309' }] } } }), /between -125 and \+125/);
});
