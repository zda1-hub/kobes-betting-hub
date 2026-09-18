const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSelection, combinationSelections } = require('./wager-terms');
test('normalizes published shorthand and annotations without changing odds or lines', () => {
  assert.equal(normalizeSelection("3*Bills/Lions o53' (-110)"), 'Bills/Lions Over 53.5 (-110)');
  assert.equal(normalizeSelection('Bills - 5.5 -105 (2u)'), 'Bills -5.5 -105 (2u)');
  assert.equal(normalizeSelection('.5U - Pat Freiermuth (PIT) OVER 24.5 Receiving Yards (-118)'), 'Pat Freiermuth OVER 24.5 Receiving Yards (-118)');
  assert.equal(normalizeSelection('1pm Rays / Athletics OVER 7.5 -115 (2u)'), 'Rays / Athletics OVER 7.5 -115 (2u)');
  assert.equal(normalizeSelection('KC @ HOU Under 9 -141 1U'), 'KC at HOU Under 9 -141 1U');
});
test('distinguishes slash matchups from fully specified combination legs', () => {
  assert.equal(combinationSelections('Rays / Athletics OVER 7.5').length, 1);
  assert.deepEqual(combinationSelections('Bills ML / Over 44'), ['Bills ML', 'Over 44']);
  assert.deepEqual(combinationSelections('Parlay 1: Mets ML + Royals +1.5'), ['Mets ML', 'Royals +1.5']);
});
