const test = require('node:test');
const assert = require('node:assert/strict');
const { currentSeason, nbaLogs, nhlLogs, mlbLogs, research, toCsv, csvRows } = require('./free-leagues');

test('streamed CSV preserves quoted commas and embedded line breaks', () => {
  const rows = [...csvRows('id,description\n1,"Single, to left"\n2,"First line\nsecond line"\n')];
  assert.deepEqual(rows, [{ id: '1', description: 'Single, to left' },
    { id: '2', description: 'First line\nsecond line' }]);
});

test('season files follow the season ending year', () => {
  const date = new Date('2026-11-14T00:00:00Z');
  assert.equal(currentSeason('NBA', date), 2027);
  assert.equal(currentSeason('NHL', date), 2027);
  assert.equal(currentSeason('MLB', date), 2026);
});

test('NBA excludes zero-minute and future games and computes combined stats', () => {
  const rows = [
    { player_id: '1', player_name: 'Sample Player', team_abbreviation: 'NYK', season_type: 'regular-season', game_id: '1', game_date: '2026-11-10', wl: 'W', min: '30', pts: '20', ast: '7' },
    { player_id: '1', player_name: 'Sample Player', team_abbreviation: 'NYK', season_type: 'regular-season', game_id: '2', game_date: '2026-11-11', wl: 'L', min: '0', pts: '0', ast: '0' },
    { player_id: '1', player_name: 'Sample Player', team_abbreviation: 'NYK', season_type: 'regular-season', game_id: '3', game_date: '2026-11-14', wl: 'W', min: '30', pts: '30', ast: '7' }
  ];
  const logs = nbaLogs(rows, { name: 'Sample Player', stat: 'points_assists', season: 2027, today: '2026-11-14' });
  assert.equal(logs.length, 1); assert.equal(logs[0].stats.points_assists, 27);
});

test('full player names match across accent and spacing differences', () => {
  const rows = [{ player_id: '1', player_name: 'Nikola Jokić', team_abbreviation: 'DEN',
    season_type: 'regular-season', game_id: '1', game_date: '2026-11-10', wl: 'W', min: '30', pts: '25' }];
  const logs = nbaLogs(rows, { name: '  Nikola   Jokic  ', stat: 'points', season: 2027, today: '2026-11-14' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].stats.points, 25);
});

test('NHL excludes preseason and zero-ice-time rows', () => {
  const rows = [
    { player_id: '1', player_name: 'A. Skater', team_abbrev: 'FLA', game_id: '2026020001', game_date: '2026-11-10', toi: '14:20', shots_on_goal: '3' },
    { player_id: '1', player_name: 'A. Skater', team_abbrev: 'FLA', game_id: '2026010002', game_date: '2026-11-11', toi: '14:20', shots_on_goal: '5' },
    { player_id: '1', player_name: 'A. Skater', team_abbrev: 'FLA', game_id: '2026020003', game_date: '2026-11-12', toi: '00:00', shots_on_goal: '0' }
  ];
  const logs = nhlLogs(rows, { name: 'A. Skater', team: 'FLA', stat: 'shots_on_goal', season: 2027, today: '2026-11-14' });
  assert.equal(logs.length, 1); assert.equal(logs[0].stats.shots_on_goal, 3);
});

test('MLB derives hits, home runs and RBI from final regular-season at bats only', () => {
  const schedule = [
    { game_pk: '1', game_type: 'R', abstract_state: 'Final', game_date: '2026-06-01' },
    { game_pk: '2', game_type: 'R', abstract_state: 'Live', game_date: '2026-06-02' }
  ];
  const rows = [
    { game_pk: '1', batter_id: '10', description: 'Sample Batter singles to left.', event_type: 'single', rbi: '1' },
    { game_pk: '1', batter_id: '10', description: 'Sample Batter homers.', event_type: 'home_run', rbi: '2' },
    { game_pk: '1', batter_id: '11', description: 'Other Batter strikes out.', event_type: 'strikeout', rbi: '0' },
    { game_pk: '2', batter_id: '10', description: 'Sample Batter singles.', event_type: 'single', rbi: '0' }
  ];
  for (const [stat, expected] of [['hits', 2], ['home_runs', 1], ['runs_batted_in', 3]]) {
    const logs = mlbLogs(rows, schedule, { name: 'Sample Batter', stat, season: 2026, today: '2026-06-03' });
    assert.equal(logs.length, 1); assert.equal(logs[0].stats[stat], expected);
  }
});

test('research exports sourced per-game rows; no model computes the count', async () => {
  const csv = 'player_id,player_name,team_abbreviation,season_type,game_id,game_date,wl,min,pts,ast\n' +
    '1,Sample Player,NYK,regular-season,1,2026-11-10,W,30,20,7\n';
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => Buffer.from(csv) });
  const result = await research({ sport: 'NBA', name: 'Sample Player', stat: 'points', line: 19.5,
    season: 2027, now: Date.parse('2026-11-14T00:00:00Z'), fetchImpl });
  assert.equal(result.analysis.l20.hits, 1);
  assert.match(toCsv(result), /2026-11-10/);
  assert.match(toCsv(result), /sportsdataverse-data\/releases\/download/);
});

test('early-season last 20 spans seasons while season rate stays current-only', async () => {
  const header = 'player_id,player_name,team_abbreviation,season_type,game_id,game_date,wl,min,pts,ast\n';
  const current = header + '1,Sample Player,NYK,regular-season,new,2026-11-10,W,30,25,4\n';
  const previous = header + '1,Sample Player,NYK,regular-season,old,2026-04-10,L,30,10,4\n';
  const fetchImpl = async url => ({ ok: true, arrayBuffer: async () => Buffer.from(
    url.includes('2027.csv') ? current : previous) });
  const result = await research({ sport: 'NBA', name: 'Sample Player', stat: 'points', line: 19.5,
    season: 2027, now: Date.parse('2026-11-14T00:00:00Z'), fetchImpl });
  assert.deepEqual([result.analysis.season.hits, result.analysis.season.sample], [1, 1]);
  assert.deepEqual([result.analysis.l20.hits, result.analysis.l20.sample], [1, 2]);
  assert.match(toCsv(result), /"2026","2026-04-10"/);
  assert.match(toCsv(result), /player_game_logs_2026.csv/);
});
