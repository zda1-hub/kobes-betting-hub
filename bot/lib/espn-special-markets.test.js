const test = require('node:test');
const assert = require('node:assert/strict');
const { specialMarketGrade, number } = require('./espn-special-markets');
const { gradePickFromEspn, inningsToOuts } = require('./espn-grading');
const { netUnitsFor } = require('./pick-log');
function summary(a = [0, 0, 1, 0, 0, 8], b = [0, 1, 0, 1, 0, 0]) {
  return { header: { competitions: [{ id: '42', status: { type: { completed: true } }, competitors: [
    { team: { displayName: 'Detroit Tigers', shortDisplayName: 'Tigers', abbreviation: 'DET' }, score: String(a.reduce((x,y)=>x+y,0)), winner: true, linescores: a.map(displayValue => ({ displayValue: String(displayValue) })) },
    { team: { displayName: 'Texas Rangers', shortDisplayName: 'Rangers', abbreviation: 'TEX' }, score: String(b.reduce((x,y)=>x+y,0)), winner: false, linescores: b.map(displayValue => ({ displayValue: String(displayValue) })) }
  ] }] } };
}
const row = { operating_date: '2026-09-17', league: 'MLB', event: 'Detroit Tigers at Texas Rangers', result: 'PENDING' };
function fetcher(s) { return async url => new Response(JSON.stringify(url.includes('/summary?') ? s : { events: [{ id: '42', status: { type: { completed: true } }, competitions: s.header.competitions }] })); }
test('F5 uses the five complete innings, never a later comeback', async () => {
  const s = summary();
  for (const [selection, result] of [['Tigers F5 ML -116', 'L'], ['Tigers F5 +1.5 -110', 'W'], ['Tigers/Rangers F5 Under 3 -110', 'P']]) {
    const grade = await gradePickFromEspn({ ...row, event: '', selection }, { fetchImpl: fetcher(s) });
    assert.equal(grade.status, 'GRADED', selection + ': ' + grade.reason);
    assert.equal(grade.result, result, selection);
  }
  assert.equal(specialMarketGrade({ selection: 'Tigers F5 ML' }, summary([0,0,0,0,0], [0,0,0,0,0]), 'baseball/mlb').result, 'P');
});
test('NRFI/YRFI require both completed first-inning halves and exact game resolution', async () => {
  for (const [selection, result] of [['Tigers/Rangers NRFI -105', 'W'], ['Tigers/Rangers YRFI +100', 'L']]) {
    assert.equal((await gradePickFromEspn({ ...row, event: '', selection }, { fetchImpl: fetcher(summary()) })).result, result);
  }
  const s = summary(); s.header.competitions[0].competitors[1].linescores[0].displayValue = '';
  assert.equal(specialMarketGrade({ selection: 'Tigers/Rangers NRFI' }, s, 'baseball/mlb').status, 'PENDING');
});
test('missing innings, X, blank and invalid innings notation are unknown, not zero', () => {
  for (const value of ['', null, '--', 'X']) assert.equal(Number.isNaN(number(value)), true);
  assert.equal(Number.isNaN(inningsToOuts('5.3')), true);
  assert.equal(specialMarketGrade({ selection: 'Tigers F5 ML' }, summary([0,0,0,0], [0,0,0,0]), 'baseball/mlb').status, 'PENDING');
});
test('football and WNBA first-half grades use only two quarters; second-half rules cannot be guessed', () => {
  for (const league of ['football/nfl', 'football/college-football', 'basketball/wnba', 'basketball/nba']) {
    assert.equal(specialMarketGrade({ selection: 'Tigers +3.5 1H' }, summary([0,0,20,20],[1,1,0,0]), league).result, 'W');
    assert.equal(specialMarketGrade({ selection: 'Tigers 2H ML' }, summary(), league).status, 'PENDING');
  }
});
test('touchdown scorer is the receiver/rusher, never the passer; first scorer uses ordered plays', () => {
  const s = summary();
  s.boxscore = { players: [{ statistics: [{ athletes: ['Josh Allen','James Cook','Tee Higgins'].map(displayName => ({ athlete: { displayName }, stats: ['1'] })) }] }] };
  s.scoringPlays = [
    { type: { text: 'Field Goal Good' }, text: 'Kicker 20 Yd Field Goal' },
    { type: { text: 'Passing Touchdown' }, text: 'Tee Higgins 21 Yd pass from Josh Allen (Kick)', period: { number: 1 }, clock: { displayValue: '08:00' } },
    { type: { text: 'Rushing Touchdown' }, text: 'James Cook 5 Yd Rush (Kick)', period: { number: 2 }, clock: { displayValue: '03:00' } }
  ];
  for (const [selection,result] of [['Josh Allen Anytime TD','L'],['James Cook Anytime TD','W'],['James Cook 1st TD','L'],['Tee Higgins 1st TD','W']]) assert.equal(specialMarketGrade({selection},s,'football/nfl').result,result,selection);
  assert.equal(specialMarketGrade({selection:'Absent Player Anytime TD'},s,'football/nfl').status,'PENDING');
  s.boxscore.players[0].statistics[0].athletes[0].stats=['0'];
  assert.equal(specialMarketGrade({selection:'Josh Allen Anytime TD'},s,'football/nfl').status,'PENDING');
  s.scoringPlays.reverse();
  assert.equal(specialMarketGrade({selection:'James Cook 1st TD'},s,'football/nfl').status,'PENDING');
});
test('special-market missing data cannot fall through to a full-game grade', async () => {
  const s = summary(); delete s.header.competitions[0].competitors[0].linescores;
  const grade = await gradePickFromEspn({...row,selection:'Tigers F5 ML'}, {fetchImpl:fetcher(s)});
  assert.equal(grade.status,'PENDING');
  s.header.competitions[0].id = 'wrong';
  assert.equal((await gradePickFromEspn({...row,selection:'Tigers ML'}, {fetchImpl:fetcher(s)})).status,'PENDING');
});
test('explicit same-game parlay resolves its total from the exact first-leg game', async () => {
  const grade = await gradePickFromEspn({...row,event:'',selection:'Tigers ML / Over 3 -115 (0.75U Parlay)'}, {fetchImpl:fetcher(summary())});
  assert.equal(grade.status,'GRADED',grade.reason); assert.equal(grade.result,'W');
  assert.equal(netUnitsFor({...row,result:grade.result,published_odds_american:'-115',units_risked:'0.75'}),0.75*100/115);
  assert.equal(netUnitsFor({...row,result:'W',published_odds_american:'',units_risked:'0.75'}),null);
});
test('parlay push, unclear legs and teasers stay pending rather than inventing a payout', async () => {
  for (const selection of ['Tigers ML / Over 11 -115 Parlay','Tigers/Rangers Parlay','Tigers +7 / Over 11 7-Point Teaser -130']) {
    assert.equal((await gradePickFromEspn({...row,event:'',selection},{fetchImpl:fetcher(summary())})).status,'PENDING',selection);
  }
});
test('additional basketball leagues select their own endpoint, not an NFL or MLB event', async () => {
  for (const [league,path] of [['WNBA','basketball/wnba'],['NBA','basketball/nba'],['NCAAB','basketball/mens-college-basketball']]) {
    const urls=[]; const fetchImpl=async url=>{urls.push(url);return fetcher(summary())(url);};
    const grade=await gradePickFromEspn({...row,league,selection:'Tigers ML'}, {fetchImpl});
    assert.equal(grade.status,'GRADED'); assert.equal(urls.every(url=>url.includes(path)),true);
  }
});
test('summary team name works when shortDisplayName is absent, as in real ESPN finals', async () => {
  const s=summary();for (const c of s.header.competitions[0].competitors) {c.team.name=c.team.shortDisplayName;delete c.team.shortDisplayName;}
  assert.equal((await gradePickFromEspn({...row,event:'',selection:'Tigers F5 ML -110'},{fetchImpl:fetcher(s)})).result,'L');
});
test('soccer full-time draw loses a three-way ML, while extra-time remains held', async () => {
  const s=summary([1],[1]);s.header.competitions[0].status={period:2,type:{name:'STATUS_FULL_TIME',completed:true}};
  assert.equal((await gradePickFromEspn({...row,league:'MLS',selection:'Tigers ML'},{fetchImpl:fetcher(s)})).result,'L');
  s.header.competitions[0].status.period=4;
  assert.equal((await gradePickFromEspn({...row,league:'MLS',selection:'Tigers ML'},{fetchImpl:fetcher(s)})).status,'PENDING');
});
test('missing-opponent player resolution is unique across the complete slate', async () => {
  const s=summary();s.boxscore={players:[{statistics:[{name:'receiving',keys:['receivingYards'],athletes:[{athlete:{displayName:'Exact Player'},stats:['80']}]}]}]};
  const r={...row,league:'NFL',event:'',selection:'Exact Player Over 50.5 Receiving Yards'};
  assert.equal((await gradePickFromEspn(r,{fetchImpl:fetcher(s)})).result,'W');
  const f=async url=>new Response(JSON.stringify(url.includes('/summary?')?s:{events:[{id:'42',competitions:s.header.competitions},{id:'43',competitions:s.header.competitions}]}));
  assert.equal((await gradePickFromEspn(r,{fetchImpl:f})).status,'PENDING');
  assert.equal((await gradePickFromEspn({...r,selection:'Exact Player Jr Over 50.5 Receiving Yards'},{fetchImpl:fetcher(s)})).status,'PENDING');
  assert.equal((await gradePickFromEspn({...r,selection:'Exact Player 80+ Receiving Yards'},{fetchImpl:fetcher(s)})).result,'W');
  assert.equal((await gradePickFromEspn({...r,selection:'Exact Player 81+ Receiving Yards'},{fetchImpl:fetcher(s)})).result,'L');
});
test('hits+runs+RBIs uses every exact stat and never treats a missing component as zero', async () => {
  const s=summary();s.boxscore={players:[{statistics:[{type:'batting',keys:['hits','runs','RBIs'],athletes:[{athlete:{displayName:'Exact Player'},stats:['1','1','1']}]}]}]};
  const r={...row,selection:'Exact Player Over 2.5 Hits+Runs+RBIs'};
  assert.equal((await gradePickFromEspn(r,{fetchImpl:fetcher(s)})).result,'W');
  s.boxscore.players[0].statistics[0].athletes[0].stats[2]='';
  assert.equal((await gradePickFromEspn(r,{fetchImpl:fetcher(s)})).status,'PENDING');
});
