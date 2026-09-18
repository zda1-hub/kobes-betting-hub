const test = require('node:test');
const assert = require('node:assert/strict');
const { matchTennisCompetition, gradeTennisMatch } = require('./espn-tennis-grading');
function feed(date = '2026-09-17T19:00Z') {
  return [{ tour: 'wta', payload: { events: [{ name: 'Verified tournament', groupings: [{ competitions: [{
    id: '123', date, type: { text: "Women's Singles" }, status: { type: { completed: true, name: 'STATUS_FINAL' } },
    competitors: [{ athlete: { displayName: 'Marta Kostyuk' }, winner: true, linescores: [{ value: 6, winner: true }, { value: 6, winner: true }] },
      { athlete: { displayName: 'Liudmila Samsonova' }, winner: false, linescores: [{ value: 3, winner: false }, { value: 2, winner: false }] }]
  }] }] }] } }];
}
test('tennis matches original player/opponent/date, not the tournament date', () => {
  const row = { operating_date:'2026-09-17', selection:'Kostyuk -1.5 Sets vs Samsonova -124 (1U)' };
  assert.equal(gradeTennisMatch(row,matchTennisCompetition(row,feed())).result,'W');
  assert.equal(matchTennisCompetition(row,feed('2026-09-18T19:00Z')),null);
  assert.equal(matchTennisCompetition({...row,selection:'Kostyuk ML vs Wrong -124'},feed()),null);
});
test('tennis game handicaps differ from set handicaps; ambiguous duplicates and retirements stay pending', () => {
  const row={operating_date:'2026-09-17',selection:'Kostyuk -6.5 vs Samsonova -124'};
  assert.equal(gradeTennisMatch(row,matchTennisCompetition(row,feed())).result,'W');
  assert.equal(matchTennisCompetition(row,[...feed(),...feed()]),null);
  const f=feed(); f[0].payload.events[0].groupings[0].competitions[0].notes=[{text:'Retired'}];
  assert.equal(gradeTennisMatch(row,matchTennisCompetition(row,f)).status,'PENDING');
});
test('doubles and missing set data cannot be graded as singles', () => {
  const row={operating_date:'2026-09-17',selection:'Kostyuk ML -124'};const f=feed();
  f[0].payload.events[0].groupings[0].competitions[0].type.text="Women's Doubles";
  assert.equal(matchTennisCompetition(row,f),null);
  const f2=feed();f2[0].payload.events[0].groupings[0].competitions[0].competitors[0].linescores[0].value='';
  assert.equal(gradeTennisMatch(row,matchTennisCompetition(row,f2)).status,'PENDING');
});
