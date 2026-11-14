const test = require('node:test');
const assert = require('node:assert/strict');
const { weeklyLogs, parseCsv, fetchWeeklyLogs } = require('./nflverse');

const stats = 'player_id,player_display_name,season,week,season_type,game_id,team,opponent_team,receptions\n' +
  'p1,"Smith, Jr.",2026,1,REG,game1,BUF,MIN,4\n' +
  'p1,"Smith, Jr.",2026,2,REG,game2,BUF,NE,5\n' +
  'p1,"Smith, Jr.",2026,3,REG,game3,BUF,NYJ,\n' +
  'p2,Other,2026,1,REG,game1,BUF,MIN,1\n';
const schedule = 'game_id,season,game_type,gameday,home_score,away_score\n' +
  'game1,2026,REG,2026-09-01,20,10\n' +
  'game2,2026,REG,2026-09-08,,\n' +
  'game3,2026,REG,2026-09-15,30,17\n';

test('nflverse rows require completed games and observed stats', () => {
  assert.equal(parseCsv(stats)[0].player_display_name, 'Smith, Jr.');
  const logs = weeklyLogs(stats, schedule, { season: 2026, playerId: 'p1', stat: 'receptions' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].date, '2026-09-01');
  assert.equal(logs[0].stats.receptions, 4);
  assert.equal(logs[0].source, 'nflverse stats_player');
});

test('fetch joins the two current source files without declaring roster or odds verified', async () => {
  const fetchImpl = async url => ({ ok: true, text: async () => url.includes('stats_player') ? stats : schedule });
  const result = await fetchWeeklyLogs({ season: 2026, playerId: 'p1', stat: 'receptions', fetchImpl });
  assert.equal(result.logs.length, 1);
  assert.equal(Object.hasOwn(result.logs[0], 'rosterVerified'), false);
  assert.throws(() => weeklyLogs(stats, schedule, { season: 2026, playerId: 'p1', stat: 'unsupported' }));
});
