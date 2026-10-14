const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicResults } = require('./public-results');

const row = (id, result, extra = {}) => ({
  pick_id: id, operating_date: '2026-09-24', published_at: `2026-09-24T1${id}:00:00Z`,
  post_reference: `https://discord.com/channels/1/2/${id}`, status: result === 'PENDING' ? 'PUBLISHED' : 'GRADED',
  result, sport: 'NFL', selection: `Pick ${id}`, published_line: '+3.5', published_odds_american: '-110',
  result_verified_source: result === 'PENDING' ? '' : 'https://www.espn.com/game/1',
  result_verified_at: result === 'PENDING' ? '' : '2026-09-24T23:00:00Z', ...extra,
});

test('public results include every verified published outcome and keep pending separate', () => {
  const snapshot = buildPublicResults([row('1', 'W'), row('2', 'L'), row('3', 'P'), row('4', 'V'), row('5', 'PENDING'), row('6', 'W', { published_at: '' })], '2026-09-24', new Date('2026-09-25T01:00:00Z'));
  assert.deepEqual(snapshot.overall, { wins: 1, losses: 1, pushes: 1, voids: 1 });
  assert.equal(snapshot.pending, 1);
  assert.equal(snapshot.settled, 4);
  assert.deepEqual(snapshot.recent.map((item) => item.result).sort(), ['L', 'P', 'V', 'W']);
  assert.deepEqual(snapshot.wins.map((item) => item.selection), ['Pick 1']);
});

test('the public winning plays list is not limited to the recent fifty settled picks', () => {
  const rows = Array.from({ length: 60 }, (_, index) => row(String(index + 100), 'W'));
  const snapshot = buildPublicResults(rows, '2026-09-24');
  assert.equal(snapshot.recent.length, 50);
  assert.equal(snapshot.wins.length, 60);
});

test('tracking start uses the earliest published pick, including pending, rather than the recent window', () => {
  const snapshot = buildPublicResults([row('1', 'W'), row('2', 'PENDING', { operating_date: '2026-09-10' }), row('3', 'W', { operating_date: '2026-08-01', published_at: '' })], '2026-10-04');
  assert.equal(snapshot.trackingSince, '2026-09-10');
  assert.equal(buildPublicResults([], '2026-10-04').trackingSince, null);
});

test('public metadata validates unambiguous mismatches and holds ambiguous sports without changing wins or source terms', () => {
  const items=[row('1','W',{selection:'Buccaneers +8.5',sport:'MLB',source_name:'Source A'}),row('2','W',{selection:'Dodgers ML -150',sport:'NCAAF'}),row('3','W',{selection:'Iowa State +10.5 2U',sport:'NHL'})];
  const result=buildPublicResults(items,'2026-09-24');
  assert.equal(result.wins.find(i=>i.id==='1').sport,'Football');
  assert.equal(result.wins.find(i=>i.id==='1').source,'Source A');
  assert.equal(result.wins.find(i=>i.id==='2').sport,'Baseball');
  assert.equal(result.wins.find(i=>i.id==='3').sport,'');
  assert.equal(result.wins.find(i=>i.id==='3').sportStatus,'needs_review');
  assert.equal(result.overall.wins,3);assert.equal(items[0].sport,'MLB');
  assert.deepEqual(result.wins.map(i=>i.selection).sort(),items.map(i=>i.selection).sort());
});

test('previous-day expert snapshot exposes only count summaries and holds duplicate conflicting grades', () => {
  const rows=[row('1','W',{source_name:'Alpha',wager_scope:'individual'}),row('2','W',{source_name:'Alpha',selection:'Pick 1',wager_scope:'individual'}),row('3','L',{source_name:'Alpha',wager_scope:'individual'}),row('4','PENDING',{source_name:'Alpha',wager_scope:'individual'}),row('5','W',{source_name:'Beta',operating_date:'2026-09-23'})];
  const snapshot=buildPublicResults(rows,'2026-09-25',new Date('2026-09-25T20:00:00Z'),{expertChannelIds:['2']});
  assert.deepEqual(snapshot.expertRecords,{date:'2026-09-24',experts:[{source:'Alpha',wins:1,losses:1,pushes:0,voids:0,pending:1}]});
  assert.doesNotMatch(JSON.stringify(snapshot.expertRecords),/Pick|selection|odds|post_reference/);
});

test('expert record counts exclude non-expert channels and hold conflicting or unexpanded groups', () => {
  const rows=[row('1','W',{source_name:'Alpha',wager_scope:'individual'}),row('2','L',{source_name:'Alpha',selection:'Pick 1',wager_scope:'individual'}),row('tg-20260924-1-1','W',{source_name:'Alpha',wager_scope:'',post_reference:'https://discord.com/channels/1/2/33'}),row('4','W',{source_name:'Alpha',post_reference:'https://discord.com/channels/1/9/4',wager_scope:'individual'})];
  const snapshot=buildPublicResults(rows,'2026-09-25',new Date('2026-09-25T20:00:00Z'),{expertChannelIds:['2']});
  assert.deepEqual(snapshot.expertRecords.experts,[{source:'Alpha',wins:0,losses:0,pushes:0,voids:0,pending:2}]);
});
