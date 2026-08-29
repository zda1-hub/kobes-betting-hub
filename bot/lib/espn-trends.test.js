const test = require('node:test');
const assert = require('node:assert/strict');
const { espnUrls, normalizeStandings, playerLeaders, reportEmbeds } = require('./espn-trends');

test('ESPN URLs use the requested league and date', () => {
  const urls = espnUrls({ league: 'mlb', date: '2026-08-29' });
  assert.match(urls.scoreboard, /baseball\/mlb\/scoreboard\?dates=20260829/);
  assert.match(urls.standings, /baseball\/mlb\/standings/);
});

test('standings flatten nested league divisions and rank teams', () => {
  const teams = normalizeStandings({ children: [{ standings: { entries: [
    { team: { id: 'a', displayName: 'Alpha' }, stats: [
      { name: 'overall', displayValue: '70-30' }, { name: 'winPercent', value: 0.7 },
      { name: 'Home', displayValue: '40-10' }, { name: 'Road', displayValue: '30-20' },
      { name: 'Last Ten Games', displayValue: '8-2' }, { name: 'streak', displayValue: 'W4' }
    ] },
    { team: { id: 'b', displayName: 'Beta' }, stats: [
      { name: 'overall', displayValue: '50-50' }, { name: 'winPercent', value: 0.5 }
    ] }
  ] } }] });
  assert.equal(teams[0].name, 'Alpha');
  assert.equal(teams[0].rank, 1);
  assert.equal(teams[1].rank, 2);
});

test('player leaders retain the named player, category, and current stat value', () => {
  const leaders = playerLeaders({ leaders: [{
    shortDisplayName: 'HR', leaders: [{ athlete: { displayName: 'A. Player' }, displayValue: '31' }]
  }] });
  assert.deepEqual(leaders, [{ label: 'HR', player: 'A. Player', value: '31' }]);
});

test('trend embeds are research-only and link to both ESPN sources', () => {
  const embeds = reportEmbeds({
    league: 'MLB', leagueId: 'mlb', operatingDate: '2026-08-29', generatedAt: '2026-08-29T12:00:00.000Z',
    disclaimer: 'Research snapshot only.', sources: { standings: 'https://espn.example/standings', scoreboard: 'https://espn.example/scoreboard' },
    leagueTable: [{ rank: 1, name: 'Alpha', overall: '70-30' }],
    matchups: [{ name: 'Alpha at Beta', start: '4:00 PM PDT', status: 'Scheduled', link: '', away: { rank: 1, name: 'Alpha', overall: '70-30', road: '30-20', lastTen: '8-2', streak: 'W4' }, home: { rank: 2, name: 'Beta', overall: '50-50', home: '25-25', lastTen: '5-5', streak: 'L1' }, awayPlayerLeaders: [{ label: 'HR', player: 'A. Player', value: '31' }], homePlayerLeaders: [] }]
  });
  assert.match(embeds[0].description, /Research snapshot only/);
  assert.match(embeds[0].description, /ESPN standings/);
  assert.match(embeds[1].description, /Alpha at Beta/);
  assert.match(embeds[1].description, /A\. Player HR 31/);
});
