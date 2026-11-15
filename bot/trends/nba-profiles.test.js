'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exactPlayer, playerProfile, teamProfile, formatPlayerProfile, formatTeamProfile } = require('./nba-profiles');

const now = new Date('2026-11-14T20:00:00.000Z');
const boston = { id: 2, full_name: 'Boston Celtics', name: 'Celtics', abbreviation: 'BOS' };
const philly = { id: 23, full_name: 'Philadelphia 76ers', name: '76ers', abbreviation: 'PHI' };
const brown = { id: 70, first_name: 'Jaylen', last_name: 'Brown', position: 'G', team: boston };
const teamsResponse = async url => {
  assert.equal(url, 'https://api.balldontlie.io/v1/teams');
  return { ok: true, json: async () => ({ data: [boston, philly] }) };
};
const game = (id, date, state, home = boston, away = philly) => ({
  id, date, season: date.startsWith('2026') ? 2026 : 2025,
  status_state: state, postseason: false, home_team: home, visitor_team: away,
  home_team_id: home.id, visitor_team_id: away.id,
  home_team_score: state === 'final' ? 110 : null,
  visitor_team_score: state === 'final' ? 100 : null,
  datetime: `${date}T23:00:00Z`
});
const stat = (id, date, pts, reb, ast, min = '30') => ({
  player: { id: 70 }, game: game(id, date, 'final'), pts, reb, ast, min
});

test('player profile uses played final logs, prior-season L20, and reports injury uncertainty', async () => {
  const routes = [];
  const readPages = async route => {
    routes.push(route);
    if (route.startsWith('/v1/players/active')) return [brown];
    if (route.includes('seasons[]=2026') && route.startsWith('/v1/stats')) return [
      stat(1, '2026-11-12', 28, 7, 3), stat(1, '2026-11-12', 28, 7, 3),
      stat(2, '2026-11-10', 0, 0, 0, '0'),
      { ...stat(3, '2026-11-09', 26, 5, 2), game: game(3, '2026-11-09', 'scheduled') }
    ];
    if (route.includes('seasons[]=2025') && route.startsWith('/v1/stats')) return [stat(4, '2025-11-12', 22, 6, 4)];
    if (route.startsWith('/v1/player_injuries')) return [{ status: 'Questionable' }];
    if (route.startsWith('/v1/games')) return [game(5, '2026-11-12', 'final'), game(6, '2026-11-16', 'scheduled')];
    throw new Error(`unexpected route ${route}`);
  };
  const result = await playerProfile({ team: 'BOS', player: 'Jaylen Brown', now,
    apiKey: 'fixture', fetchImpl: teamsResponse, readPages });
  assert.equal(result.seasonSample.games, 1);
  assert.equal(result.l20.games, 2);
  assert.equal(result.l20.averages.points, 25);
  assert.equal(result.logs[0].opponent, 'Philadelphia 76ers');
  assert.equal(result.availability.status, 'injury-entry');
  assert.equal(result.versusNextOpponent.games, 2);
  assert.match(formatPlayerProfile(result), /participation|check before game/);
  assert.ok(routes.some(route => route.includes('seasons[]=2025')));
});

test('team profile filters wrong-team roster and unverified games', async () => {
  const readPages = async route => {
    if (route.startsWith('/v1/players/active')) return [brown,
      { ...brown, id: 71, first_name: 'Other', team: philly }];
    if (route.startsWith('/v1/games')) return [game(5, '2026-11-12', 'final'),
      game(6, '2026-11-13', 'scheduled'), game(7, '2026-11-16', 'scheduled')];
    if (route.startsWith('/v1/player_injuries')) return [
      { player: { id: 70, first_name: 'Jaylen', last_name: 'Brown', team_id: 2 }, status: 'Out' },
      { player: { id: 71, first_name: 'Other', last_name: 'Player', team_id: 23 }, status: 'Out' }
    ];
    throw new Error(`unexpected route ${route}`);
  };
  const result = await teamProfile({ team: 'Boston Celtics', now,
    apiKey: 'fixture', fetchImpl: teamsResponse, readPages });
  assert.equal(result.roster.length, 1);
  assert.equal(result.injuryEntries.length, 1);
  assert.equal(result.recent.length, 1);
  assert.equal(result.upcoming.gameId, 7);
  assert.match(formatTeamProfile(result), /Jaylen Brown: Out/);
});

test('unknown and ambiguous teams fail closed before fetching player history', async () => {
  await assert.rejects(playerProfile({ team: 'NY', player: 'Jaylen Brown', now,
    apiKey: 'fixture', fetchImpl: teamsResponse, readPages: async () => { throw new Error('should not fetch'); } }),
  /Exact NBA team/);
});

test('exact player identity folds presentation accents without relaxing team match', () => {
  const denver = { id: 8, full_name: 'Denver Nuggets' };
  const jokic = { id: 246, first_name: 'Nikola', last_name: 'Jokić', team: denver };
  assert.equal(exactPlayer([jokic], 'Nikola Jokic', 8).id, 246);
  assert.throws(() => exactPlayer([jokic], 'Nikola Jokic', 2), /not verified/);
});
