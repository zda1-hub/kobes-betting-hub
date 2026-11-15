'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { researchNba, formatNbaResearch } = require('./nba-search');
const { TERMS_URL } = require('./bdl-nba');

test('member NBA search joins an accent-insensitive player to game, market, history and injury data', async () => {
  const calls = [];
  const result = await researchNba({
    root: '/tmp/test', oddsKey: 'odds-test', bdlKey: 'bdl-test',
    team: 'Denver', player: 'Nikola Jokić', stat: 'points', side: 'over', line: 19.5,
    now: new Date('2026-11-14T20:00:00Z'),
    readMarket: async query => { calls.push(query); return {
      event: { id: 'example-event', commence_time: '2026-11-15T01:00:00Z' }, line: 19.5,
      fetchedAt: '2026-11-14T20:00:00Z',
      offers: [{ sportsbook: 'Book', odds: -180, updatedAt: '2026-11-14T19:59:00Z' }],
      otherLines: [{ line: 24.5, sportsbook: 'Book', odds: +120,
        updatedAt: '2026-11-14T19:59:00Z' }]
    }; },
    readEvent: async () => ({ home_team: { id: 1, full_name: 'Denver Nuggets' },
      visitor_team: { id: 2, full_name: 'Phoenix Suns' } }),
    readPlayer: async () => ({ id: 7, first_name: 'Nikola', last_name: 'Jokic',
      team: { id: 1, full_name: 'Denver Nuggets' } }),
    readHistory: async query => { calls.push(query); return { rightsUrl: TERMS_URL,
      sourceUrl: 'https://api.balldontlie.io/v1/stats', checkedAt: '2026-11-14T20:00:00Z',
      analysis: Object.fromEntries(['season', 'l5', 'l10', 'l20'].map(key =>
        [key, { hits: 4, sample: 5, pushes: 0, average: 25,
          games: [20, 25, 28, 30, 22].map(value => ({ value })) }])) }; },
    readAvailability: async () => ({ status: 'active-roster-no-listed-injury',
      rightsUrl: TERMS_URL, checkedAt: '2026-11-14T20:00:00Z' })
  });
  assert.equal(calls[0].player, 'Nikola Jokić');
  assert.equal(calls[1].playerId, 7);
  assert.equal(result.player, 'Nikola Jokic');
  assert.match(formatNbaResearch(result), /participation not confirmed/);
  assert.match(formatNbaResearch(result), /19\.5 points: -180 at Book/);
  assert.match(formatNbaResearch(result), /24\.5: \+120 at Book · season 3\/5/);
  assert.equal(calls[1].line, 19.5);
});

test('NBA search holds a source with unverified commercial rights', async () => {
  await assert.rejects(researchNba({ root: '/tmp/test', oddsKey: 'a', bdlKey: 'b',
    team: 'Denver', player: 'Nikola Jokic', stat: 'points', side: 'over', line: 19.5,
    readMarket: async () => ({ event: {}, offers: [], otherLines: [], fetchedAt: '' }),
    readEvent: async () => ({ home_team: { id: 1, full_name: 'Denver' }, visitor_team: { id: 2, full_name: 'Phoenix' } }),
    readPlayer: async () => ({ id: 7, first_name: 'Nikola', last_name: 'Jokic', team: { id: 1, full_name: 'Denver' } }),
    readHistory: async () => ({ rightsUrl: 'unknown', analysis: {} }),
    readAvailability: async () => ({ status: 'active-roster-no-listed-injury', rightsUrl: TERMS_URL })
  }), /rights/);
});
