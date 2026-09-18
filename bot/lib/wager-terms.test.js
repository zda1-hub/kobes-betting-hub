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
  assert.deepEqual(combinationSelections('Mets ML + Royals +1.5 + Twins/Angels Under 8.5'), ['Mets ML', 'Royals +1.5', 'Twins/Angels Under 8.5']);
  assert.equal(combinationSelections('Colston Loveland Over 46.5 Receiving Yards (-111 @ NoVig/ProphetX)').length, 1);
  assert.equal(combinationSelections('James Cook 50+ rushing yards / James Cook Anytime Touchdown Parlay').length, 2);
});
test('only explicit unambiguous player abbreviations and omitted official suffixes match', () => {
  const { playerNameMatches } = require('./wager-terms');
  assert.equal(playerNameMatches('James Cook', 'James Cook III'), true);
  assert.equal(playerNameMatches('Exact Player Jr', 'Exact Player'), false);
  assert.equal(playerNameMatches('A. St.Brown', 'Amon-Ra St. Brown'), true);
  assert.equal(playerNameMatches('ARSB', 'Amon-Ra St. Brown'), true);
  assert.equal(playerNameMatches('J.Allen', 'Josh Allen'), true);
  assert.equal(playerNameMatches('J.Allen', 'Joe Allen'), true, 'caller must enforce full-slate uniqueness');
});
