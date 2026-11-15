'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { exactActivePlayer, exactEvent, finalizedLogs, history, availability } = require('./bdl-nba');

const now = new Date('2026-11-15T19:00:00Z');
const game = { id: 123, datetime: '2026-11-15T20:00:00Z', status_state: 'scheduled',
  home_team: { id: 7, full_name: 'Denver Nuggets' },
  visitor_team: { id: 18, full_name: 'New Orleans Pelicans' } };
function response(data, meta = { per_page: 100 }) {
  return { ok: true, json: async () => ({ data, meta }) };
}

test('accent-folded Jokić/Jokic lookup still requires exact active player and team', async () => {
  const fetchImpl = async () => response([
    { id: 1, first_name: 'Nikola', last_name: 'Jokić', team: { id: 7 } },
    { id: 2, first_name: 'Nikola', last_name: 'Jokic', team: { id: 99 } },
    { id: 3, first_name: 'Nikola', last_name: 'Jovic', team: { id: 7 } }
  ]);
  const player = await exactActivePlayer({ name: 'Nikola Jokic', game, apiKey: 'fixture', fetchImpl });
  assert.equal(player.id, 1);
  await assert.rejects(exactActivePlayer({ name: 'Nikola Jovic', game: { ...game,
    home_team: { id: 99 }, visitor_team: { id: 18 } }, apiKey: 'fixture', fetchImpl }),
    /not verified/);
});

test('game lookup requires both exact teams and a matching scheduled tipoff', async () => {
  const fetchImpl = async () => response([game, { ...game, id: 124,
    datetime: '2026-11-15T21:00:00Z' }]);
  const found = await exactEvent({ event: { commence_time: game.datetime,
    home_team: 'Denver Nuggets', away_team: 'New Orleans Pelicans' }, now,
    apiKey: 'fixture', fetchImpl });
  assert.equal(found.id, 123);
  const oddsTenMinutesLater = await exactEvent({ event: {
    commence_time: '2026-11-15T20:10:00Z', home_team: 'Denver Nuggets',
    away_team: 'New Orleans Pelicans' }, now, apiKey: 'fixture', fetchImpl });
  assert.equal(oddsTenMinutesLater.id, 123);
  await assert.rejects(exactEvent({ event: {
    commence_time: '2026-11-15T20:20:00Z', home_team: 'Denver Nuggets',
    away_team: 'New Orleans Pelicans' }, now, apiKey: 'fixture', fetchImpl }), /did not match/);
});

test('history ignores unfinished games and zero-minute records; injury entries block availability', async () => {
  const sample = (id, status, min, pts, season = 2026) => ({ player: { id: 1 },
    game: { id, date: '2026-11-01', season, status_state: status, postseason: false }, min, pts });
  assert.deepEqual(finalizedLogs([sample(1, 'final', '30', 28), sample(2, 'in_progress', '31', 32),
    sample(3, 'final', '0', 0)], { playerId: 1, season: 2026,
    today: '2026-11-15', stat: 'points' }).map(row => row.gameId), ['1']);
  const fetchImpl = async url => url.includes('player_injuries') ? response([{ status: 'Questionable' }]) :
    response([sample(1, 'final', '30', 28)]);
  const result = await history({ playerId: 1, stat: 'points', line: 20.5, now,
    apiKey: 'fixture', fetchImpl });
  assert.equal(result.analysis.season.hits, 1);
  assert.equal(result.analysis.l20.sample, 1);
  assert.equal((await availability({ playerId: 1, now, apiKey: 'fixture', fetchImpl })).status, 'unconfirmed');
});
