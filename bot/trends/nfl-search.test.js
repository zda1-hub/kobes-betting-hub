const test = require('node:test');
const assert = require('node:assert/strict');
const { research, formatResearch, resolvePlayer } = require('./nfl-search');

const header = 'player_id,player_display_name,season,week,season_type,game_id,team,opponent_team,receptions\n';
const stats = header + [4, 5, 0].map((count, index) =>
  `p1,Sample Player,2099,${index + 1},REG,g${index + 1},BUF,NE,${count}\n`).join('') +
  'p2,Sample Other,2099,1,REG,g1,BUF,NE,2\n';
const schedule = 'game_id,season,game_type,gameday,home_score,away_score\n' +
  [1, 2, 3].map(i => `g${i},2099,REG,2099-09-0${i},20,10\n`).join('');
const fetchImpl = async url => ({ ok: true, text: async () => url.includes('stats_player') ? stats : schedule });

test('NFL search returns completed historical counts with source and uncertainty', async () => {
  const result = await research({ player: 'Sample Player', stat: 'receptions', line: 3.5, alternateLines: [4.5, 1.5],
    side: 'over', season: 2099, fetchImpl, now: Date.parse('2099-09-04T00:00:00Z') });
  assert.equal(result.analysis.season.hits, 2);
  assert.equal(result.analysis.season.sample, 3);
  const message = formatResearch(result);
  assert.match(message, /2\/3 hits/);
  assert.match(message, /Other thresholds .*over 4.5: 1\/3 season/);
  assert.match(message, /Recent completed games: 2099-09-03 0/);
  assert.match(message, /Roster and injury context unavailable/);
  assert.match(message, /Game-day availability, current sportsbook line and odds are not verified/);
  assert.match(message, /nflverse weekly player stats/);
  assert.ok(message.length < 2000);
});

test('NFL search refuses ambiguous players, unavailable feed and invalid lines', async () => {
  assert.throws(() => resolvePlayer(new Map([['p1', 'Sam One'], ['p2', 'Sam Two']]), 'Sam'), /Several players match/);
  await assert.rejects(() => research({ player: 'Sample Player', stat: 'receptions',
    line: -1, season: 2098, fetchImpl }), /valid line/);
  const broken = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => research({ player: 'Sample Player', stat: 'receptions',
    line: 3, season: 2098, fetchImpl: broken }), /unavailable/);
});
