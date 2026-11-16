'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const flow = require('./prop-flow');

const now = new Date('2026-11-16T16:00:00.000Z');
const event = { id: 'eventfixture1234', commence_time: '2026-11-17T01:00:00.000Z',
  home_team: 'Boston Celtics', away_team: 'New York Knicks' };
const nflEvent = { ...event, home_team: 'Buffalo Bills', away_team: 'New York Jets' };
const json = (data, remaining = '6000') => ({ ok: true,
  headers: { get: () => remaining }, json: async () => data });

function nbaFetch(url) {
  if (url.includes('/events/') && url.includes('/odds?')) return json({ ...event, bookmakers: [
    { key: 'book', title: 'Book', last_update: '2026-11-16T15:59:00Z', markets: [
      { key: 'player_assists_alternate', last_update: '2026-11-16T15:59:00Z', outcomes: [
        { name: 'Over', description: 'Payton Pritchard', point: 2.5, price: -300 },
        { name: 'Over', description: 'Other Player', point: 3.5, price: -150 } ] } ] } ] });
  if (url.endsWith('/v4/sports/')) return json([]);
  if (url.endsWith('/events')) return json([event, { ...event,
    id: 'laterfixture1234', commence_time: '2026-11-30T01:00:00Z', home_team: 'Denver Nuggets' }]);
  if (url.includes('/v1/teams')) return json({ data: [
    { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics' },
    { id: 20, abbreviation: 'NYK', full_name: 'New York Knicks' } ], meta: { next_cursor: null } });
  if (url.includes('/v1/players/active')) return json({ data: Array.from({ length: 28 }, (_, i) => ({
    id: i + 1, first_name: i === 0 ? 'Payton' : 'Player', last_name: i === 0 ? 'Pritchard' : String(i),
    team: { id: 2 } })), meta: { next_cursor: null } });
  throw new Error(`Unexpected NBA fixture request ${url}`);
}

test('two member sessions remain private and expire', () => {
  const a = flow.start('member-A', 'vip-channel', now.valueOf());
  const b = flow.start('member-B', 'vip-channel', now.valueOf());
  assert.notEqual(a.id, b.id);
  assert.equal(flow.get(a.id, 'member-A', now.valueOf()), a);
  assert.throws(() => flow.get(a.id, 'member-B', now.valueOf()), /belongs to another member/);
  assert.equal(flow.get(b.id, 'member-B', now.valueOf()), b);
  assert.throws(() => flow.get(a.id, 'member-A', now.valueOf() + 16 * 60_000), /expired/);
  flow.sessions.delete(b.id);
});

test('NBA flow lists only next-seven-day teams, active players, league stats and real alternate lines', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prop-flow-test-'));
  try {
    const state = flow.start('member-A', 'vip-channel', now.valueOf());
    assert.deepEqual(flow.render(state).components[0].toJSON().components[0].options.map(o => o.value),
      ['NBA', 'NFL']);
    state.league = 'NBA';
    await flow.loadTeams(state, { oddsKey: 'odds', bdlKey: 'bdl', now, fetchImpl: nbaFetch });
    assert.deepEqual(state.teams.map(team => team.value), ['BOS', 'NYK']);
    state.team = state.teams[0];
    await flow.loadPlayers(state, { bdlKey: 'bdl', now, fetchImpl: nbaFetch });
    assert.equal(state.players.length, 28);
    state.stage = 'player';
    assert.equal(flow.render(state).components.length, 2);
    assert.equal(flow.render(state).components[0].toJSON().components[0].options.length, 25);
    state.page = 1;
    assert.equal(flow.render(state).components[0].toJSON().components[0].options.length, 3);
    state.player = state.players.find(player => player.label === 'Payton Pritchard');
    state.stat = 'assists';
    state.stage = 'stat';
    state.page = 0;
    assert.deepEqual(flow.render(state).components[0].toJSON().components[0].options.map(o => o.value),
      ['points', 'rebounds', 'assists', 'threes', 'pra', 'points_rebounds', 'points_assists', 'rebounds_assists']);
    await flow.loadLines(state, { root, oddsKey: 'odds', now, fetchImpl: nbaFetch });
    assert.deepEqual(state.lines.map(row => row.value), ['2.5', 'custom']);
    assert.match(state.lines[0].label, /-300/);
    flow.sessions.delete(state.id);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('NFL teams and active roster come from scheduled events and nflverse context', async () => {
  const fetched = [];
  const fetchImpl = async url => {
    fetched.push(url);
    if (url.endsWith('/events')) return json([nflEvent]);
    if (url.includes('/rosters/roster_')) return { ok: true, text: async () =>
      'season,team,position,depth_chart_position,jersey_number,status,full_name,gsis_id,week\n' +
      '2026,BUF,QB,QB,17,ACT,Josh Allen,player1,10\n' +
      '2026,BUF,QB,QB,17,RES,Josh Allen,player1,9\n' +
      '2026,BUF,WR,WR,10,IR,Other Player,player2,10\n' };
    if (url.includes('/injuries/injuries_')) return { ok: true, text: async () =>
      'season,team,week,gsis_id,report_status\n2026,BUF,10,player1,\n' };
    if (url.includes('/timestamp.json')) return { ok: true, text: async () =>
      JSON.stringify({ last_updated: '2026-11-16 10:00:00 EST' }) };
    throw new Error(`Unexpected NFL fixture request ${url}`);
  };
  const state = flow.start('member-B', 'vip-channel', now.valueOf());
  state.league = 'NFL';
  await flow.loadTeams(state, { oddsKey: 'odds', now, fetchImpl });
  assert.deepEqual(state.teams.map(team => team.value), ['BUF', 'NYJ']);
  state.team = state.teams[0];
  await flow.loadPlayers(state, { now, fetchImpl });
  assert.deepEqual(state.players, [{ label: 'Josh Allen', value: 'player1' }]);
  state.stage = 'stat';
  assert.deepEqual(flow.render(state).components[0].toJSON().components[0].options.map(o => o.value),
    ['passing_yards', 'rushing_yards', 'receiving_yards', 'receptions',
      'rush_receiving_yards', 'anytime_touchdown']);
  assert.ok(fetched.some(url => url.includes('roster_2026.csv')));
  flow.sessions.delete(state.id);
});
