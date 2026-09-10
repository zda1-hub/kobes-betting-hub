const test = require('node:test');
const assert = require('node:assert/strict');
const { gradePickFromEspn, inningsToOuts } = require('./espn-grading');

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
