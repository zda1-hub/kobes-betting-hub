'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeNba, computeNfl, lookupRank } = require('./team-ranks');

test('NBA aggregates real participating box rows by opponent; broad G is not guessed as PG', () => {
  const game = { id: 15907438, date: '2024-10-22', season: 2024,
    status_state: 'final', postseason: false, home_team_id: 2, visitor_team_id: 20 };
  const rows = [
    { game, min: '30', player: { id: 70, position: 'G' }, team: { id: 2, abbreviation: 'BOS' },
      pts: 23, ast: 1, reb: 7, turnover: 2, fg3m: 5, stl: 1, blk: 0 },
    { game, min: '31', player: { id: 71, position: 'C' }, team: { id: 20, abbreviation: 'NYK' },
      pts: 18, ast: 2, reb: 9, turnover: 1, fg3m: 0, stl: 0, blk: 1 },
    { game, min: '0', player: { id: 72, position: 'PG' }, team: { id: 2, abbreviation: 'BOS' },
      pts: 99, ast: 99, reb: 99, turnover: 0, fg3m: 9, stl: 9, blk: 9 }
  ];
  const sheet = computeNba(rows, { season: 2024 });
  assert.equal(sheet.offense.pts.find(row => row.team === 'BOS').average, 23);
  assert.equal(sheet.defense.pts.find(row => row.team === 'NYK').average, 23);
  assert.equal(lookupRank(sheet, { opponentAbbr: 'NYK', position: 'PG', stat: 'pts' }), null);
  assert.equal(sheet.position.C.reb.find(row => row.team === 'BOS').average, 9);
});

test('NFL weekly player stats produce position averages from completed regular games', () => {
  const schedules = 'season,game_type,gameday,home_score,away_score,game_id,home_team,away_team\n' +
    '2026,REG,2026-11-15,31,24,2026_10_KC_ATL,KC,ATL\n';
  const stats = 'season,season_type,game_id,team,opponent_team,position,passing_yards,passing_tds,rushing_yards,rushing_tds,receptions,receiving_yards,receiving_tds,targets,fg_made,pat_made,special_teams_tds,def_sacks,def_interceptions,passing_interceptions,fumbles_lost_total\n' +
    '2026,REG,2026_10_KC_ATL,KC,ATL,QB,348,5,20,0,0,0,0,0,0,0,0,0,0,1,0\n' +
    '2026,REG,2026_10_KC_ATL,ATL,KC,QB,210,1,15,0,0,0,0,0,0,0,0,0,0,0,0\n';
  const sheet = computeNfl(stats, schedules, { season: 2026 });
  assert.equal(sheet.offense.points.find(row => row.team === 'KC').average, 31);
  assert.equal(sheet.position.QB.passing_yards.find(row => row.team === 'ATL').average, 348);
  assert.equal(sheet.defense.passing_yards.find(row => row.team === 'ATL').average, 348);
  assert.equal(lookupRank(sheet, { opponentAbbr: 'ATL', position: 'QB',
    stat: 'passing_yards' }), null, 'two-team fixtures must not masquerade as a 32-team rank');
  assert.match(sheet.attribution, /nflverse \(CC BY 4\.0\)/);
});
