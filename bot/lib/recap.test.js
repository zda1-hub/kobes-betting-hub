const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecapEmbed, makeResults } = require('./recap');

const recap = {
  date: '2026-08-17',
  record: '2-1-0 (+0.85u)',
  results: 'W — #1 — Player OVER 6.5 Ks\nL — #2 — Team ML\nW — #3 — Player points',
  summary: '2-1 yesterday 🙏',
  imageUrl: 'https://example.com/recap.png'
};

test('formats a verified recap', () => {
  assert.match(makeResults(recap.results), /^• W — #1/m);
  assert.equal(buildRecapEmbed(recap).title, 'Daily Recap — 2026-08-17');
});

test('requires ISO date and results', () => {
  assert.throws(() => buildRecapEmbed({ ...recap, date: 'tomorrow' }), /YYYY-MM-DD/);
  assert.throws(() => makeResults(''), /1–30 verified results/);
});
