'use strict';

// Read-only NBA research for member searches. ALL-STAR supports game logs,
// active players and injuries; it does not include season averages/standings.
// Every average below is computed from displayed completed-game samples.
const bdl = require('./bdl-nba');
const { playerNameKey } = require('./player-name');
const { localParts, TIME_ZONE } = require('./schedule');

const FIELDS = { points: 'pts', rebounds: 'reb', assists: 'ast' };
const SOURCE = 'https://api.balldontlie.io/v1';

function exactTeam(teams, query) {
  const key = playerNameKey(query);
  const matches = teams.filter(team => [team.full_name, team.name, team.abbreviation]
    .some(value => playerNameKey(value) === key));
  if (matches.length !== 1) throw new Error('Exact NBA team was not verified');
  return matches[0];
}

function exactPlayer(players, query, teamId) {
  const key = playerNameKey(query);
  const matches = players.filter(row => row.team?.id === teamId &&
    playerNameKey(`${row.first_name} ${row.last_name}`) === key);
  if (matches.length !== 1) throw new Error('Exact active NBA player and team were not verified');
  return matches[0];
}

function playedLogs(rows, playerId, today, season) {
  const seen = new Set();
  return rows.filter(row => row.player?.id === playerId && row.game?.season === season &&
    row.game?.status_state === 'final' && row.game?.postseason === false &&
    row.game?.date < today && Number.parseFloat(row.min) > 0 &&
    Object.values(FIELDS).every(field => Number.isFinite(row[field])) &&
    Number.isInteger(row.game.id))
    .sort((a, b) => b.game.date.localeCompare(a.game.date) || b.game.id - a.game.id)
    .filter(row => { if (seen.has(row.game.id)) return false; seen.add(row.game.id); return true; })
    .map(row => ({ gameId: row.game.id, date: row.game.date, season,
      points: row.pts, rebounds: row.reb, assists: row.ast,
      minutes: Number.parseFloat(row.min), homeTeamId: row.game.home_team_id,
      awayTeamId: row.game.visitor_team_id }));
}

function average(logs, stat) {
  if (!logs.length) return null;
  return Math.round(logs.reduce((sum, game) => sum + game[stat], 0) / logs.length * 10) / 10;
}

function sample(logs) {
  return { games: logs.length, averages: Object.fromEntries(Object.keys(FIELDS)
    .map(stat => [stat, average(logs, stat)])) };
}

function opponent(game, teamId) {
  if (game.home_team?.id === teamId) return { name: game.visitor_team?.full_name, site: 'home' };
  if (game.visitor_team?.id === teamId) return { name: game.home_team?.full_name, site: 'away' };
  return null;
}

function gameContext(rows, teamId, today, now) {
  const own = rows.filter(game => opponent(game, teamId) && !game.postseason);
  const recent = own.filter(game => game.status_state === 'final' && game.date < today &&
    Number.isFinite(game.home_team_score) && Number.isFinite(game.visitor_team_score))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map(game => {
      const home = game.home_team.id === teamId;
      const scored = home ? game.home_team_score : game.visitor_team_score;
      const allowed = home ? game.visitor_team_score : game.home_team_score;
      return { gameId: game.id, date: game.date, opponent: opponent(game, teamId).name,
        site: home ? 'home' : 'away', scored, allowed,
        outcome: scored > allowed ? 'W' : scored < allowed ? 'L' : 'T' };
    });
  const upcoming = own.filter(game => game.status_state === 'scheduled' &&
    Date.parse(game.datetime) > now.valueOf()).sort((a, b) =>
      Date.parse(a.datetime) - Date.parse(b.datetime))[0];
  return { recent, upcoming: upcoming ? { gameId: upcoming.id, startsAt: upcoming.datetime,
    opponent: opponent(upcoming, teamId).name, site: opponent(upcoming, teamId).site } : null };
}

async function loadBase({ team, now, apiKey, fetchImpl, readPages }) {
  if (!team || !apiKey || !(now instanceof Date) || !Number.isFinite(now.valueOf()))
    throw new Error('NBA profile requires team, valid time and BALLDONTLIE key');
  const teams = await readTeams({ apiKey, fetchImpl });
  const found = exactTeam(teams, team);
  const season = bdl.seasonStart(now);
  const today = localParts(now, TIME_ZONE).date;
  return { teams, team: found, season, today };
}

async function readTeams({ apiKey, fetchImpl = fetch }) {
  const response = await fetchImpl(`${SOURCE}/teams`, {
    headers: { Authorization: apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`BALLDONTLIE teams request failed (${response.status})`);
  const body = await response.json();
  if (!Array.isArray(body?.data)) throw new Error('BALLDONTLIE teams response shape changed');
  return body.data;
}

async function playerProfile({ team, player, now = new Date(), apiKey, fetchImpl = fetch,
  readPages = bdl.pages } = {}) {
  if (!player) throw new Error('NBA player is required');
  const base = await loadBase({ team, now, apiKey, fetchImpl, readPages });
  const active = await readPages(`/v1/players/active?search=${encodeURIComponent(player.split(/\s+/)[0])}&per_page=100`,
    { apiKey, fetchImpl });
  const found = exactPlayer(active, player, base.team.id);
  const loadSeason = async year => playedLogs(await readPages(
    `/v1/stats?player_ids[]=${found.id}&seasons[]=${year}&season_type=regular&per_page=100`,
    { apiKey, fetchImpl }), found.id, base.today, year);
  const current = await loadSeason(base.season);
  const prior = current.length < 20 ? await loadSeason(base.season - 1) : [];
  const recent = [...current, ...prior].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const injuryRows = await readPages(`/v1/player_injuries?player_ids[]=${found.id}&per_page=100`,
    { apiKey, fetchImpl });
  const games = await readPages(`/v1/games?team_ids[]=${base.team.id}&seasons[]=${base.season}&season_type=regular&per_page=100`,
    { apiKey, fetchImpl });
  const context = gameContext(games, base.team.id, base.today, now);
  const idToTeam = new Map(base.teams.map(row => [row.id, row.full_name]));
  const logs = recent.map(row => ({ ...row,
    opponent: idToTeam.get(row.homeTeamId === base.team.id ? row.awayTeamId : row.homeTeamId) || null }));
  const versusNextOpponent = context.upcoming ? logs.filter(row =>
    row.opponent === context.upcoming.opponent) : [];
  return { playerId: found.id, player: `${found.first_name} ${found.last_name}`,
    position: found.position || null, team: base.team.full_name, season: base.season,
    seasonSample: sample(current), l5: sample(logs.slice(0, 5)),
    l10: sample(logs.slice(0, 10)), l20: sample(logs),
    versusNextOpponent: sample(versusNextOpponent), logs,
    upcoming: context.upcoming,
    availability: injuryRows.length ? { status: 'injury-entry',
      reportedStatuses: injuryRows.map(row => row.status).filter(Boolean) } :
      { status: 'no-listed-injury', note: 'Participation is not confirmed' },
    checkedAt: now.toISOString(), source: `${SOURCE}/stats?player_ids%5B%5D=${found.id}`,
    rightsUrl: bdl.TERMS_URL };
}

async function teamProfile({ team, now = new Date(), apiKey, fetchImpl = fetch,
  readPages = bdl.pages } = {}) {
  const base = await loadBase({ team, now, apiKey, fetchImpl, readPages });
  const [active, games, injuryRows] = await Promise.all([
    readPages(`/v1/players/active?team_ids[]=${base.team.id}&per_page=100`, { apiKey, fetchImpl }),
    readPages(`/v1/games?team_ids[]=${base.team.id}&seasons[]=${base.season}&season_type=regular&per_page=100`,
      { apiKey, fetchImpl }),
    readPages(`/v1/player_injuries?team_ids[]=${base.team.id}&per_page=100`, { apiKey, fetchImpl })
  ]);
  const roster = active.filter(row => row.team?.id === base.team.id)
    .map(row => ({ id: row.id, name: `${row.first_name} ${row.last_name}`,
      position: row.position || null })).sort((a, b) => a.name.localeCompare(b.name));
  const injuries = injuryRows.filter(row => row.player?.team_id === base.team.id)
    .map(row => ({ playerId: row.player.id,
      player: `${row.player.first_name} ${row.player.last_name}`,
      status: row.status || 'unconfirmed' }));
  const context = gameContext(games, base.team.id, base.today, now);
  return { teamId: base.team.id, team: base.team.full_name,
    abbreviation: base.team.abbreviation, conference: base.team.conference || null,
    division: base.team.division || null, season: base.season,
    roster, injuryEntries: injuries, recent: context.recent,
    upcoming: context.upcoming, checkedAt: now.toISOString(),
    source: `${SOURCE}/games?team_ids%5B%5D=${base.team.id}`,
    rightsUrl: bdl.TERMS_URL };
}

function formatAverage(value) { return value === null ? '—' : value.toFixed(1); }
function formatPlayerProfile(result) {
  const line = (label, data) => `${label} (${data.games} games): ${formatAverage(data.averages.points)} PTS · ` +
    `${formatAverage(data.averages.rebounds)} REB · ${formatAverage(data.averages.assists)} AST`;
  const recent = result.logs.slice(0, 5).map(row =>
    `${row.date} vs ${row.opponent || 'opponent unavailable'}: ${row.points} PTS, ${row.rebounds} REB, ${row.assists} AST`).join('\n');
  return `**Trends-tool · NBA player profile**\n${result.player} · ${result.team}` +
    `${result.position ? ` · ${result.position}` : ''}\n` +
    `${line(`${result.season} regular season`, result.seasonSample)}\n` +
    `${line('L5', result.l5)}\n${line('L10', result.l10)}\n${line('L20', result.l20)}\n` +
    `L20 may include last season when this season has fewer than 20 played games.\n` +
    `${result.upcoming ? `Next: ${result.upcoming.site} vs ${result.upcoming.opponent} · ${result.upcoming.startsAt}. ` : 'No next game in current season feed. '}` +
    `${result.upcoming ? `Against that opponent in L20: ${result.versusNextOpponent.games} games. ` : ''}` +
    `Availability: ${result.availability.status === 'injury-entry' ? `injury entry (${result.availability.reportedStatuses.join(', ') || 'status unavailable'}); check before game` : 'no injury entry; participation unconfirmed'}.\n` +
    `**Recent completed games**\n${recent || 'No completed game logs available'}\n` +
    `Source: ${result.source} · checked ${result.checkedAt}. Research only; historical averages do not predict a result.`;
}

function formatTeamProfile(result) {
  const recent = result.recent.slice(0, 5).map(row =>
    `${row.date} ${row.outcome} ${row.scored}-${row.allowed} vs ${row.opponent}`).join('\n');
  const injured = result.injuryEntries.map(row => `${row.player}: ${row.status}`).join('; ');
  return `**Trends-tool · NBA team profile**\n${result.team} · ${result.season} regular season\n` +
    `${result.upcoming ? `Next: ${result.upcoming.site} vs ${result.upcoming.opponent} · ${result.upcoming.startsAt}` : 'No next game in current season feed'}\n` +
    `Active roster: ${result.roster.length} listed. Injury entries: ${injured || 'none listed; availability unconfirmed'}.\n` +
    `**Recent completed games**\n${recent || 'No final games available'}\n` +
    `Source: ${result.source} · checked ${result.checkedAt}. Research only; verify current status before using a line.`;
}

module.exports = { exactTeam, exactPlayer, playedLogs, sample, gameContext,
  readTeams, playerProfile, teamProfile, formatPlayerProfile, formatTeamProfile };
