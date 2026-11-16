'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nbaLogs, nflLogs } = require('./bulk-data');

test('NBA standard box rows keep traded-player games and exclude DNPs/postseason', () => {
  const game = (id, date, postseason = false) => ({ id, date, season: 2026,
    status_state: 'final', postseason, home_team_id: 2, visitor_team_id: 20 });
  const player = { id: 70, position: 'G' };
  const base = { player, min: '30', pts: 23, reb: 7, ast: 1, fg3m: 5 };
  const rows = [
    { ...base, game: game(1, '2026-11-01'), team: { id: 2, abbreviation: 'BOS' } },
    { ...base, game: game(2, '2026-11-02'), team: { id: 20, abbreviation: 'NYK' } },
    { ...base, min: '0', game: game(3, '2026-11-03'), team: { id: 20, abbreviation: 'NYK' } },
    { ...base, game: game(4, '2026-11-04', true), team: { id: 20, abbreviation: 'NYK' } }
  ];
  const logs = nbaLogs(rows, { today: '2026-11-16', season: 2026 }).get('70');
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map(row => row.teamId), [2, 20]);
  assert.equal(logs[0].stats.pra, 31);
});

test('NFL weekly logs include only completed regular games with observed stats', () => {
  const schedules = 'season,game_type,gameday,home_score,away_score,game_id,home_team,away_team\n' +
    '2026,REG,2026-11-15,31,24,g1,KC,ATL\n2026,REG,2026-11-22,,,g2,KC,DEN\n';
  const header = 'season,season_type,game_id,player_id,team,opponent_team,position_group,passing_yards,rushing_yards,receiving_yards,receptions,rushing_tds,receiving_tds,special_teams_tds\n';
  const stats = header + '2026,REG,g1,id1,KC,ATL,QB,348,20,0,0,0,0,0\n' +
    '2026,REG,g2,id1,KC,DEN,QB,999,0,0,0,0,0,0\n';
  const logs = nflLogs({ statsCsv: stats, scheduleCsv: schedules, season: 2026,
    playerIds: ['id1'] }).get('id1');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].stats.passing_yards, 348);
  assert.equal(logs[0].stats.rush_receiving_yards, 20);
});
