'use strict';

const { parseCsv } = require('./nflverse');

const NBA_METRICS = Object.freeze({ pts: 'PTS', ast: 'AST', reb: 'REB', turnover: 'TOV',
  fg3m: '3PM', stl: 'STL', blk: 'BLK' });
const NFL_OFFENSE = Object.freeze({ points: 'Points', passing_yards: 'Pass yds',
  rushing_yards: 'Rush yds', passing_tds: 'Pass TD', rushing_tds: 'Rush TD',
  receptions: 'Receptions' });
const NFL_DEFENSE = Object.freeze({ points: 'Points allowed', passing_yards: 'Pass yds allowed',
  rushing_yards: 'Rush yds allowed', passing_tds: 'Pass TD allowed',
  rushing_tds: 'Rush TD allowed', def_sacks: 'Sacks',
  def_interceptions: 'INT', turnovers_forced: 'Turnovers forced' });
const NFL_POSITION = Object.freeze({ passing_yards: 'Pass yds', passing_tds: 'Pass TD',
  rushing_yards: 'Rush yds', receptions: 'Receptions', receiving_yards: 'Rec yds',
  receiving_tds: 'Rec TD', targets: 'Targets', fg_made: 'FG', pat_made: 'XP',
  rush_receiving_yards: 'Rush+rec yds', anytime_touchdown: 'Anytime TD' });
const NBA_POSITION = Object.freeze({ ...NBA_METRICS, pra: 'PRA',
  points_rebounds: 'P+R', points_assists: 'P+A', rebounds_assists: 'R+A' });

function add(map, key, metric, value, gameId) {
  if (!key || !Number.isFinite(value)) return;
  if (!map.has(key)) map.set(key, new Map());
  const games = map.get(key);
  if (!games.has(gameId)) games.set(gameId, {});
  games.get(gameId)[metric] = (games.get(gameId)[metric] || 0) + value;
}
function rowsForMetric(map, metric, allTeams, { includeEmpty = false } = {}) {
  const rows = allTeams.map(team => {
    const games = [...(map.get(team)?.values() || [])].filter(row => Number.isFinite(row[metric]));
    return { team, games: games.length,
      average: games.length ? games.reduce((sum, row) => sum + row[metric], 0) / games.length : null };
  });
  const available = rows.filter(row => row.average !== null).sort((a, b) =>
    b.average - a.average || a.team.localeCompare(b.team));
  available.forEach((row, index) => { row.rank = index + 1; });
  return includeEmpty ? [...available, ...rows.filter(row => row.average === null)] : available;
}
function nbaStat(row, metric) {
  const combos = { pra: ['pts', 'reb', 'ast'], points_rebounds: ['pts', 'reb'],
    points_assists: ['pts', 'ast'], rebounds_assists: ['reb', 'ast'] };
  const fields = combos[metric] || [metric];
  return fields.every(field => Number.isFinite(row[field])) ?
    fields.reduce((sum, field) => sum + row[field], 0) : null;
}
function computeNba(rows, { season, endDate = '9999-12-31' }) {
  const offense = new Map(), defense = new Map(), position = new Map();
  const teams = new Set();
  const teamsByGame = new Map();
  for (const row of rows) if (row.game?.id && row.team?.id && row.team?.abbreviation) {
    if (!teamsByGame.has(row.game.id)) teamsByGame.set(row.game.id, new Map());
    teamsByGame.get(row.game.id).set(row.team.id, row.team.abbreviation);
  }
  let dataDate = null;
  for (const row of rows) {
    const game = row.game;
    if (game?.season !== season || game.status_state !== 'final' || game.postseason !== false ||
        game.date > endDate ||
        !(Number.parseFloat(row.min) > 0) || !row.team?.abbreviation) continue;
    const own = row.team.abbreviation;
    const opponentId = row.team.id === game.home_team_id ? game.visitor_team_id : game.home_team_id;
    const opponent = teamsByGame.get(game.id)?.get(opponentId);
    if (!opponent) continue;
    teams.add(own); teams.add(opponent);
    if (!dataDate || game.date > dataDate) dataDate = game.date;
    for (const metric of Object.keys(NBA_POSITION)) {
      const value = nbaStat(row, metric);
      if (Object.hasOwn(NBA_METRICS, metric)) add(offense, own, metric, value, game.id);
      add(defense, opponent, metric, value, game.id);
      if (metric === 'turnover') add(defense, opponent, 'turnovers_forced', value, game.id);
    }
    const pos = row.player?.position;
    // BDL commonly uses broad G/F/C labels. Never relabel a G as PG or SG.
    if (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) {
      for (const metric of Object.keys(NBA_POSITION))
        add(position, `${opponent}:${pos}`, metric, nbaStat(row, metric), game.id);
    }
  }
  const list = [...teams].sort();
  return { sport: 'NBA', season, dataDate,
    offense: Object.fromEntries(Object.keys(NBA_METRICS).map(metric =>
      [metric, rowsForMetric(offense, metric, list, { includeEmpty: true })])),
    defense: Object.fromEntries([...Object.keys(NBA_POSITION), 'turnovers_forced'].map(metric => [metric,
      rowsForMetric(defense, metric, list, { includeEmpty: true })])),
    position: Object.fromEntries(['PG', 'SG', 'SF', 'PF', 'C'].map(pos => [pos,
      Object.fromEntries(Object.keys(NBA_POSITION).map(metric => [metric,
        rowsForMetric(new Map(list.map(team => [team, position.get(`${team}:${pos}`) || new Map()])),
          metric, list, { includeEmpty: true })]))])) };
}

function numeric(row, name) {
  return row[name] === '' || row[name] === undefined ? null : Number(row[name]);
}
function computeNfl(statsCsv, schedulesCsv, { season, endDate = '9999-12-31' }) {
  const schedules = parseCsv(schedulesCsv).filter(row => row.season === String(season) &&
    row.game_type === 'REG' && row.gameday && row.gameday <= endDate &&
    row.home_score !== '' && row.away_score !== '');
  const games = new Map(schedules.map(row => [row.game_id, row]));
  const teams = [...new Set(schedules.flatMap(row => [row.home_team, row.away_team]))].sort();
  const offense = new Map(), defense = new Map(), position = new Map();
  for (const game of schedules) {
    add(offense, game.home_team, 'points', Number(game.home_score), game.game_id);
    add(offense, game.away_team, 'points', Number(game.away_score), game.game_id);
    add(defense, game.home_team, 'points', Number(game.away_score), game.game_id);
    add(defense, game.away_team, 'points', Number(game.home_score), game.game_id);
  }
  for (const row of parseCsv(statsCsv)) {
    if (row.season !== String(season) || row.season_type !== 'REG' ||
        !games.has(row.game_id) || !row.team || !row.opponent_team) continue;
    const own = row.team, opponent = row.opponent_team, gameId = row.game_id;
    for (const metric of Object.keys(NFL_OFFENSE).filter(key => key !== 'points')) {
      const value = numeric(row, metric);
      add(offense, own, metric, value, gameId);
      add(defense, opponent, metric, value, gameId);
    }
    for (const metric of ['receiving_yards', 'rush_receiving_yards', 'anytime_touchdown']) {
      const value = metric === 'rush_receiving_yards' ?
        [numeric(row, 'rushing_yards'), numeric(row, 'receiving_yards')] :
        metric === 'anytime_touchdown' ?
          ['rushing_tds', 'receiving_tds', 'special_teams_tds'].map(key => numeric(row, key)) :
          [numeric(row, metric)];
      if (value.every(Number.isFinite)) add(defense, opponent, metric,
        value.reduce((sum, item) => sum + item, 0), gameId);
    }
    for (const metric of ['def_sacks', 'def_interceptions'])
      add(defense, own, metric, numeric(row, metric), gameId);
    const turnovers = [numeric(row, 'passing_interceptions'), numeric(row, 'fumbles_lost_total')];
    if (turnovers.every(Number.isFinite)) add(defense, opponent,
      'turnovers_forced', turnovers[0] + turnovers[1], gameId);
    const pos = row.position;
    if (['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) {
      for (const metric of Object.keys(NFL_POSITION)) {
        let value;
        if (metric === 'rush_receiving_yards') {
          const rush = numeric(row, 'rushing_yards'), rec = numeric(row, 'receiving_yards');
          value = Number.isFinite(rush) && Number.isFinite(rec) ? rush + rec : null;
        } else if (metric === 'anytime_touchdown') {
          const vals = ['rushing_tds', 'receiving_tds', 'special_teams_tds'].map(key => numeric(row, key));
          value = vals.every(Number.isFinite) ? vals.reduce((a, b) => a + b, 0) : null;
        } else value = numeric(row, metric);
        add(position, `${opponent}:${pos}`, metric, value, gameId);
      }
    }
  }
  const byPosition = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K'].map(pos => [pos,
    Object.fromEntries(Object.keys(NFL_POSITION).map(metric => [metric,
      rowsForMetric(new Map(teams.map(team => [team, position.get(`${team}:${pos}`) || new Map()])),
        metric, teams, { includeEmpty: true })]))]));
  return { sport: 'NFL', season, dataDate: schedules.map(row => row.gameday).sort().at(-1) || null,
    offense: Object.fromEntries(Object.keys(NFL_OFFENSE).map(metric =>
      [metric, rowsForMetric(offense, metric, teams, { includeEmpty: true })])),
    defense: Object.fromEntries([...new Set([...Object.keys(NFL_DEFENSE),
      'receptions', 'receiving_yards', 'rush_receiving_yards', 'anytime_touchdown'])].map(metric =>
      [metric, rowsForMetric(defense, metric, teams, { includeEmpty: true })])),
    position: byPosition, attribution: 'Data: nflverse (CC BY 4.0)' };
}

function lookupRank(sheet, { opponentAbbr, position, stat }) {
  if (!sheet || !opponentAbbr || !stat) return null;
  const metric = sheet.sport === 'NBA' ?
    ({ points: 'pts', rebounds: 'reb', assists: 'ast', threes: 'fg3m' })[stat] || stat : stat;
  const expected = sheet.sport === 'NBA' ? 30 : 32;
  const completeRank = values => {
    if (!Array.isArray(values) || values.filter(item => Number.isInteger(item.rank)).length !== expected)
      return null;
    const row = values.find(item => item.team === opponentAbbr);
    return Number.isInteger(row?.rank) ? row.rank : null;
  };
  const teamRank = completeRank(sheet.defense?.[metric]);
  const positionRank = position ? completeRank(sheet.position?.[position]?.[metric]) : null;
  if (teamRank === null && positionRank === null) return null;
  return { rank: positionRank, overRank: positionRank === null ? null : expected + 1 - positionRank,
    teamOverRank: teamRank === null ? null : expected + 1 - teamRank,
    teams: expected, dataDate: sheet.dataDate };
}

module.exports = { NBA_METRICS, NFL_OFFENSE, NFL_DEFENSE, NBA_POSITION, NFL_POSITION,
  rowsForMetric, computeNba, computeNfl, lookupRank };
