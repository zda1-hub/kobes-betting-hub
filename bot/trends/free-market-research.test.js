'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { researchFreeMarket, formatFreeMarket } = require('./free-market-research');

const query = { root: '/unused', apiKey: 'test', sport: 'NHL', team: 'Oilers',
  player: 'Connor McDavid', stat: 'shots_on_goal', side: 'over', line: 2.5,
  now: new Date('2026-11-15T20:00:00Z') };
const market = { line: 2.5, event: { away_team: 'Edmonton Oilers', home_team: 'Los Angeles Kings',
  commence_time: '2026-11-16T02:00:00Z' }, fetchedAt: '2026-11-15T20:00:00Z',
  offers: [{ player: 'Connor McDavid', line: 2.5, sportsbook: 'Book', odds: -130,
    updatedAt: '2026-11-15T19:59:00Z' }], otherLines: [] };
const window = { hits: 7, sample: 10, pushes: 0 };
const history = { analysis: { season: window, l5: window, l10: window, l20: window },
  checkedAt: '2026-11-15T20:00:00Z', sourceUrl: 'https://github.com/example' };

test('joins an exact current quote to completed games without declaring availability', async () => {
  let historicalLine, historicalTeam;
  const result = await researchFreeMarket({ ...query, marketFn: async () => market,
    historyFn: async args => { historicalLine = args.line; historicalTeam = args.team; return history; } });
  assert.equal(historicalLine, 2.5);
  assert.equal(historicalTeam, 'EDM');
  assert.equal(result.publicationEligible, false);
  assert.equal(result.availability, 'unverified');
  assert.match(formatFreeMarket(result), /7\/10/);
  assert.match(formatFreeMarket(result), /do not confirm the player will play/);
});

test('refuses a nearby or renamed player quote', async () => {
  await assert.rejects(researchFreeMarket({ ...query, marketFn: async () => ({ ...market,
    offers: [{ ...market.offers[0], line: 3.5 }] }), historyFn: async () => history }), /exact fresh/);
  await assert.rejects(researchFreeMarket({ ...query, marketFn: async () => ({ ...market,
    offers: [{ ...market.offers[0], player: 'Other Player' }] }), historyFn: async () => history }), /exact fresh/);
});

test('does not show current prop research when completed games are absent', async () => {
  await assert.rejects(researchFreeMarket({ ...query, sport: 'MLB', stat: 'hits',
    marketFn: async () => market,
    historyFn: async () => ({ ...history, analysis: { ...history.analysis,
      season: { ...window, sample: 0 } } }) }), /history is unavailable/);
});

test('compares alternate quoted lines against the same completed-game values', async () => {
  const games = [{ value: 2 }, { value: 3 }, { value: 4 }];
  const result = await researchFreeMarket({ ...query,
    marketFn: async () => ({ ...market, otherLines: [{ line: 3.5, odds: +120, sportsbook: 'Book' }] }),
    historyFn: async () => ({ ...history, analysis: {
      ...history.analysis, season: { ...window, games }, l20: { ...window, games }
    } }) });
  assert.equal(result.alternateComparisons[0].season.hits, 1);
  assert.match(formatFreeMarket(result), /3\.5 \+120 at Book: season 1\/3/);
});
