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

test('converts baseball innings notation to outs', () => {
  assert.equal(inningsToOuts('5.2'), 17);
});
