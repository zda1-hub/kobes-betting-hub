'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { researchNbaCombo, formatNbaCombo } = require('./nba-combo-research');

const rawLegs = [
  'NBA|Denver Nuggets|Nikola Jokić|points|over|19.5',
  'NBA|Denver Nuggets|Jamal Murray|assists|over|4.5'
];

test('NBA combination research shows exact same-book legs, history and correlation without invented payout', async () => {
  const result = await researchNbaCombo({ rawLegs, root: '/tmp', oddsKey: 'a', bdlKey: 'b',
    now: new Date('2026-11-15T19:00:00Z'), research: async query => ({
      ...query, team: 'Denver Nuggets', eventId: 'same-event',
      offers: [{ sportsbookKey: 'book', sportsbook: 'Book', odds: -180 }],
      analysis: { season: { hits: 9, sample: 10 }, l20: { hits: 17, sample: 20 } },
      availability: { status: 'active-roster-no-listed-injury' },
      historySource: 'https://api.balldontlie.io/v1/stats'
    }) });
  assert.equal(result.commonBook, 'book');
  assert.equal(result.combinedPayout, null);
  assert.match(result.warnings.join(' '), /Shared game/);
  const content = formatNbaCombo(result);
  assert.match(content, /Same-book exact-leg offers: book/);
  assert.match(content, /No combined sportsbook quote/);
  assert.ok(content.length < 1900);
});

test('NBA combination research refuses non-NBA legs', async () => {
  await assert.rejects(researchNbaCombo({ rawLegs: [rawLegs[0],
    'NFL|Buffalo Bills|Josh Allen|receptions|over|1.5'], root: '/tmp', oddsKey: 'a', bdlKey: 'b',
    research: async () => { throw new Error('must not call'); } }), /NBA legs only/);
});
