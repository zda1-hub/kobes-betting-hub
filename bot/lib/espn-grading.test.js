const test = require('node:test');
const assert = require('node:assert/strict');
const { gradePickFromEspn, inningsToOuts } = require('./espn-grading');

test('event matching requires both opponents, not two aliases of the same team', () => {
  const { matchingEvent } = require('./espn-grading');
  assert.equal(matchingEvent({ event: 'Chicago Cubs' }, [event]), null);
  assert.equal(matchingEvent({ event: 'Chicago Cubs at Milwaukee Brewers' }, [event]), event);
  assert.equal(matchingEvent({ event: 'Chicago Cubs at Milwaukee Brewers' }, [event, { ...event, id: 'doubleheader' }]), null);
});

const event = {
  id: '123',
  status: { type: { completed: true } },
  competitions: [{ competitors: [
    { team: { displayName: 'Chicago Cubs', shortDisplayName: 'Cubs', abbreviation: 'CHC' } },
    { team: { displayName: 'Milwaukee Brewers', shortDisplayName: 'Brewers', abbreviation: 'MIL' } }
  ] }]
};

const summary = {
  header: { competitions: [{ status: { type: { completed: true } }, competitors: [
    { team: { displayName: 'Chicago Cubs', shortDisplayName: 'Cubs', abbreviation: 'CHC' }, winner: false, score: '2' },
    { team: { displayName: 'Milwaukee Brewers', shortDisplayName: 'Brewers', abbreviation: 'MIL' }, winner: true, score: '4' }
  ] }] },
  boxscore: { players: [{ statistics: [{ type: 'pitching', keys: ['fullInnings.partInnings', 'walks', 'strikeouts'], athletes: [{ athlete: { displayName: 'Jacob Misiorowski' }, stats: ['6.0', '2', '8'] }] }] }] }
};

function espnFetch(url) {
  return Promise.resolve(new Response(JSON.stringify(url.includes('/summary?') ? summary : { events: [event] }), { status: 200 }));
}

test('gamelog fallback requires exact event, date, participation and explicit numeric evidence', async () => {
  const participated = structuredClone(summary);
  participated.boxscore.players[0].statistics = [{ type: 'batting', keys: ['atBats'], athletes: [{ athlete: { id: '42', displayName: 'Tommy Pham' }, stats: ['3'] }] }];
  const log = { names: ['hits', 'doubles', 'triples', 'homeRuns'], events: { '123': { gameDate: '2026-09-07T23:00:00Z' } }, seasonTypes: [{ categories: [{ events: [{ eventId: '123', stats: ['0', '0', '0', '0'] }] }] }] };
  const row = { operating_date: '2026-09-07', league: 'MLB', event: 'Chicago Cubs at Milwaukee Brewers', selection: 'Tommy Pham Over 1.5 Total Bases', result: 'PENDING' };
  const grade = async (box, gamelog) => gradePickFromEspn(row, { fetchImpl: async url => new Response(JSON.stringify(url.includes('/gamelog?') ? gamelog : url.includes('/summary?') ? box : { events: [event] })) });
  const zero = await grade(participated, log);
  assert.equal(zero.result, 'L');
  assert.match(zero.outcome, /0 total bases/i);
  assert.match(zero.source, /athletes\/42\/gamelog/);
  for (const mutation of [
    value => { value.events['123'].gameDate = '2026-09-08T23:00:00Z'; },
    value => { value.seasonTypes[0].categories[0].events[0].eventId = '456'; },
    value => { value.seasonTypes[0].categories[0].events[0].stats[0] = ''; },
    value => { value.seasonTypes[0].categories[0].events.push(structuredClone(value.seasonTypes[0].categories[0].events[0])); }
  ]) {
    const invalid = structuredClone(log); mutation(invalid);
    assert.equal((await grade(participated, invalid)).status, 'PENDING');
  }
  const absent = structuredClone(participated);
  absent.boxscore.players[0].statistics[0].athletes[0].stats = ['0'];
  assert.equal((await grade(absent, log)).status, 'PENDING');
  const triple = structuredClone(log);
  triple.seasonTypes[0].categories[0].events[0].stats = ['1', '0', '1', '0'];
  assert.equal((await grade(participated, triple)).result, 'W');
});

test('grades a standard final MLB player prop from the ESPN box score', async () => {
  const grade = await gradePickFromEspn({
    operating_date: '2026-09-07', league: 'MLB', event: 'Chicago Cubs at Milwaukee Brewers',
    selection: 'Jacob Misiorowski Over 5.5 Strikeouts', published_line: 'Over 5.5 Strikeouts', result: 'PENDING'
  }, { fetchImpl: espnFetch });
  assert.deepEqual(grade, {
    status: 'GRADED', result: 'W', outcome: 'Jacob Misiorowski: 8 strikeouts',
    source: 'https://www.espn.com/mlb/game/_/gameId/123'
  });
});

test('grades a final moneyline and keeps unsupported props pending', async () => {
  const moneyline = await gradePickFromEspn({
    operating_date: '2026-09-07', league: 'MLB', event: 'Chicago Cubs at Milwaukee Brewers',
    selection: 'Milwaukee Brewers ML', published_line: 'ML', result: 'PENDING'
  }, { fetchImpl: espnFetch });
  assert.equal(moneyline.result, 'W');

  const unsupported = await gradePickFromEspn({
    operating_date: '2026-09-07', league: 'MLB', event: 'Chicago Cubs at Milwaukee Brewers',
    selection: 'Jacob Misiorowski Over 1.5 Total Bases', published_line: 'Over 1.5 Total Bases', result: 'PENDING'
  }, { fetchImpl: espnFetch });
  assert.equal(unsupported.status, 'PENDING');
});

test('resolves an exact straight-team wager from a unique same-day schedule without an opponent', async () => {
  const grade = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB',
    selection: 'Brewers ML -110 (1U)', result: 'PENDING' }, { fetchImpl: espnFetch });
  assert.equal(grade.result, 'W');
  const ambiguous = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB',
    selection: 'Brewers ML -110 (1U)', result: 'PENDING' }, { fetchImpl: async url =>
    new Response(JSON.stringify(url.includes('/summary?') ? summary : { events: [event, { ...event, id: '456' }] })) });
  assert.equal(ambiguous.status, 'PENDING');
});

test('accepts signed standalone moneyline prices but not an unspecified bare team', async () => {
  for (const selection of ['Brewers -135 (3u)', 'Brewers +121']) {
    assert.equal((await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB', selection }, { fetchImpl: espnFetch })).result, 'W');
  }
  assert.equal((await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB', selection: 'Brewers' }, { fetchImpl: espnFetch })).status, 'PENDING');
});

test('short player acronyms require a unique official full-name initials match', async () => {
  const nflSummary = structuredClone(summary);
  nflSummary.boxscore.players[0].statistics = [{ type: 'receiving', keys: ['receivingYards'], athletes: [{ athlete: { displayName: 'Amon-Ra St. Brown' }, stats: ['14'] }] }];
  const result = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'NFL', selection: 'ARSB Over 12.5 Receiving Yards' }, { fetchImpl: async url => new Response(JSON.stringify(url.includes('/summary?') ? nflSummary : { events: [event] })) });
  assert.equal(result.result, 'W');
  assert.match(result.outcome, /Amon-Ra St. Brown/);
});

test('missing opponent never converts a team or player total into a full-game total', async () => {
  const team = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB', selection: 'Brewers Over 3.5', result: 'PENDING' }, { fetchImpl: espnFetch });
  assert.equal(team.status, 'PENDING');
  const player = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB', selection: 'Jacob Misiorowski Over 5.5 Strikeouts', result: 'PENDING' }, { fetchImpl: espnFetch });
  assert.equal(player.status, 'GRADED');
  assert.equal(player.outcome, 'Jacob Misiorowski: 8 strikeouts');
});

test('per-run cache reuses ESPN payloads but returns independent readable responses', async () => {
  let calls = 0;
  const cached = require('./espn-grading').createGradingFetch(async () => { calls++; return new Response('{"ok":true}'); });
  assert.deepEqual(await (await cached('url')).json(), { ok: true });
  assert.deepEqual(await (await cached('url')).json(), { ok: true });
  assert.equal(calls, 1);
});

test('uses the college-football ESPN endpoint for an NCAAF final', async () => {
  const grade = await gradePickFromEspn({
    operating_date: '2026-09-07', league: 'NCAAF', event: 'Chicago Cubs at Milwaukee Brewers',
    selection: 'Milwaukee Brewers ML', published_line: 'ML', result: 'PENDING'
  }, { fetchImpl: espnFetch });
  assert.equal(grade.status, 'GRADED');
  assert.equal(grade.source, 'https://www.espn.com/college-football/game/_/gameId/123');
});

test('converts baseball innings notation to outs', () => {
  assert.equal(inningsToOuts('5.2'), 17);
});

test('does not settle periods, parlays, or composite stats against full-game results', async () => {
  for (const selection of ['Brewers F5 ML', 'Brewers 1H ML', 'Jacob Misiorowski Over 1.5 Hits+Runs+RBIs', 'Brewers ML Parlay']) {
    const grade = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB',
      event: 'Chicago Cubs at Milwaukee Brewers', selection, result: 'PENDING' }, { fetchImpl: espnFetch });
    assert.equal(grade.status, 'PENDING', selection);
  }
});

test('blank final stats are unknown, not zero', async () => {
  const blank = JSON.parse(JSON.stringify(summary));
  blank.boxscore.players[0].statistics[0].athletes[0].stats[2] = '';
  const grade = await gradePickFromEspn({ operating_date: '2026-09-07', league: 'MLB',
    event: 'Chicago Cubs at Milwaukee Brewers', selection: 'Jacob Misiorowski Under 5.5 Strikeouts', result: 'PENDING' },
  { fetchImpl: async url => new Response(JSON.stringify(url.includes('/summary?') ? blank : { events: [event] })) });
  assert.equal(grade.status, 'PENDING');
});

test('recognizes longest-reception NFL props across ESPN stat-key variants', () => {
  const spec = require('./espn-grading').statSpec({
    selection: 'A.J. Brown Longest Reception Over 22.5 Yards',
    published_line: 'Over 22.5 Yards'
  }, [{ name: 'A.J. Brown', category: 'receiving', values: {} }]);
  assert.deepEqual(spec.key, ['longestReception', 'longReception', 'long']);
});

test('grades grouped ESPN receiving stats for a final longest-reception prop', async () => {
  const nflEvent = {
    id: '401872656',
    status: { type: { completed: true } },
    competitions: [{ competitors: [
      { team: { displayName: 'New England Patriots', shortDisplayName: 'Patriots', abbreviation: 'NE' } },
      { team: { displayName: 'Seattle Seahawks', shortDisplayName: 'Seahawks', abbreviation: 'SEA' } }
    ] }]
  };
  const nflSummary = {
    header: { competitions: [{ status: { type: { completed: true } } }] },
    boxscore: { players: [{ statistics: [{
      name: 'receiving', keys: ['receptions', 'receivingYards', 'longReception'],
      athletes: [{ athlete: { displayName: 'A.J. Brown' }, stats: ['3', '26', '14'] }]
    }] }] }
  };
  const fetchImpl = async (url) => new Response(JSON.stringify(url.includes('/summary?')
    ? nflSummary : { events: [nflEvent] }), { status: 200 });
  const grade = await gradePickFromEspn({
    operating_date: '2026-09-09', league: 'NFL', event: 'New England Patriots vs Seattle Seahawks',
    selection: 'AJ Brown Longest Reception Over 22.5 Yards', published_line: 'Over 22.5 Yards', result: 'PENDING'
  }, { fetchImpl });
  assert.equal(grade.status, 'GRADED');
  assert.equal(grade.result, 'L');
  assert.equal(grade.outcome, 'A.J. Brown: 14 longest reception');
});

test('recognizes additional common football prop keys without fuzzy arithmetic', () => {
  const { statSpec } = require('./espn-grading');
  const entries = [
    { name: 'Josh Allen', category: 'passing', values: {} },
    { name: 'Josh Allen', category: 'rushing', values: {} },
    { name: 'Stefon Diggs', category: 'receiving', values: {} }
  ];
  assert.deepEqual(statSpec({ selection: 'Josh Allen over 34.5 pass attempts' }, entries).key, ['passingAttempts', 'attempts', 'completions/passingAttempts']);
  assert.deepEqual(statSpec({ selection: 'Josh Allen over 7.5 carries' }, entries).key, ['rushingAttempts', 'attempts', 'carries']);
  assert.deepEqual(statSpec({ selection: 'Stefon Diggs over 7.5 targets' }, entries).key, ['receivingTargets', 'targets']);
});

test('grades an explicit full-game total from the final score', () => {
  const { gameTotalGrade } = require('./espn-grading');
  assert.deepEqual(gameTotalGrade({
    selection: 'Full game total Over 45.5', market: 'Full game total', published_line: 'Over 45.5'
  }, {
    header: { competitions: [{ competitors: [{ score: '27' }, { score: '20' }] }] }
  }), { result: 'W', outcome: 'Final game total: 47' });
});

test('grades only explicitly labeled team spreads', () => {
  const { spreadGrade } = require('./espn-grading');
  const final = { header: { competitions: [{ competitors: [
    { team: { displayName: 'Dallas Cowboys', shortDisplayName: 'Cowboys', abbreviation: 'DAL' }, score: '24' },
    { team: { displayName: 'New York Giants', shortDisplayName: 'Giants', abbreviation: 'NYG' }, score: '21' }
  ] }] } };
  assert.deepEqual(spreadGrade({ selection: 'Dallas Cowboys -2.5 spread', published_line: '-2.5' }, final), {
    result: 'W', outcome: 'Dallas Cowboys 24, opponent 21 (-2.5)'
  });
  assert.equal(spreadGrade({ selection: 'Dallas Cowboys -110', published_line: '-110' }, final), null);
});
