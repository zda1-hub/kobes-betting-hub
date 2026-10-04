const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { publicResultRows } = require('./public-result-rows');
const { expandPublication, sourcePacketPath, wagerFingerprint } = require('./wager-ledger');
const { buildPublicResults } = require('./public-results');

const original = (id = '20261003-001-X', date = '2026-10-03') => ({
  pick_id:id, operating_date:date, selection:'A moneyline', status:'PUBLISHED', result:'PENDING',
  published_at:`${date}T20:00:00Z`, post_reference:'https://discord.com/channels/1/2/3'
});
const packetFor = row => ({pick_id:row.pick_id, analysis:{extraction:{lossless_text_terms:true,plays:[
  {selection:'A moneyline',league:'NFL'}, {selection:'B +3.5',league:'NBA'}, {selection:'C over 2.5',league:'NHL'}
]}}});
const grade = result => ({result,status:'GRADED',result_verified_source:'https://www.espn.com/game/1',result_verified_at:'2026-10-04T02:00:00Z'});
function fixture(rows) {
  const files = new Map(), reads = [];
  for (const row of rows) {
    const packet = packetFor(row); files.set(sourcePacketPath('/packets',row.pick_id),packet);
    const children = expandPublication(row,packet);
    const file = path.join('/records',`wager-results-${row.operating_date}.json`);
    const ledger = files.get(file) || {version:1,wagers:{}};
    children.forEach((child,i)=>ledger.wagers[child.pick_id]={fingerprint:wagerFingerprint(child),result:grade(['W','L','P'][i])});
    files.set(file,ledger);
  }
  return {files,reads, options:{rows,root:'/packets',directory:'/records',readFile:async file=>{
    reads.push(file); if(!files.has(file)) throw Object.assign(new Error('missing'),{code:'ENOENT'});return JSON.stringify(files.get(file));
  }}};
}

test('public rows replace a grouped parent with independently verified W/L/P across leagues', async()=>{
  const row={...original(),...grade('W')}; const f=fixture([row]);
  const rows=await publicResultRows(f.options);
  assert.equal(rows.length,3); assert.ok(rows.every(r=>r.parent_pick_id===row.pick_id));
  assert.deepEqual(rows.map(r=>r.league),['NFL','NBA','NHL']);
  const snapshot=buildPublicResults(rows,'2026-10-04');
  assert.deepEqual(snapshot.overall,{wins:1,losses:1,pushes:1,voids:0}); assert.equal(snapshot.pending,0);
  assert.equal(snapshot.recent.some(r=>r.id===row.pick_id),false);
});

test('missing packet and unsafe unexpanded group cannot leak an old parent win',async()=>{
  const row={...original(),...grade('W')};const f=fixture([row]);
  f.files.delete(sourcePacketPath('/packets',row.pick_id));
  let rows=await publicResultRows(f.options);
  assert.equal(rows[0].result,'PENDING');assert.equal(buildPublicResults(rows,'2026-10-04').settled,0);
  f.files.set(sourcePacketPath('/packets',row.pick_id),{...packetFor(row),analysis:{extraction:{lossless_text_terms:false,plays:packetFor(row).analysis.extraction.plays}}});
  rows=await publicResultRows(f.options);assert.equal(rows.length,1);assert.equal(rows[0].result,'PENDING');
});

test('fingerprint mismatch and missing canonical child result stay pending without reuse',async()=>{
  const row=original();const f=fixture([row]);const ledger=f.files.get('/records/wager-results-2026-10-03.json');
  ledger.wagers[`${row.pick_id}-W001`].fingerprint='wrong';delete ledger.wagers[`${row.pick_id}-W002`];
  const rows=await publicResultRows(f.options);
  assert.deepEqual(rows.map(r=>r.result),['PENDING','PENDING','P']);
  assert.deepEqual(buildPublicResults(rows,'2026-10-04').overall,{wins:0,losses:0,pushes:1,voids:0});
});

test('all historical dates use canonical saved ledgers, never audit checkpoints or grading',async()=>{
  const rows=[original(),original('20260901-002-X','2026-09-01')];const f=fixture(rows);
  const before=JSON.stringify([...f.files]);let grades=0;
  const resolved=await publicResultRows({...f.options,grade:()=>{grades++;throw new Error('must not grade');}});
  assert.equal(resolved.length,6);assert.equal(grades,0);assert.equal(JSON.stringify([...f.files]),before);
  assert.equal(f.reads.filter(file=>file.includes('wager-results-')).length,2);
  assert.ok(f.reads.every(file=>!file.includes('recap-audit')));
});

test('original single picks retain their canonical grade without child-result substitution',async()=>{
  const source={...original(),...grade('L')};const ordinary={...original('official-single'),selection:'Different single',...grade('W')};const f=fixture([source]);
  f.files.set(sourcePacketPath('/packets',source.pick_id),{pick_id:source.pick_id,analysis:{extraction:{lossless_text_terms:true,plays:[{selection:source.selection}]}}});
  const rows=await publicResultRows({...f.options,rows:[source,ordinary]});
  assert.deepEqual(rows.map(r=>r.pick_id),[source.pick_id,ordinary.pick_id]);assert.deepEqual(rows.map(r=>r.result),['L','W']);
  assert.equal(f.reads.some(file=>file.includes('wager-results-')),false);
});

test('missing ledger excludes all child grades and invalid ledger fails closed',async()=>{
  const row=original();const f=fixture([row]);f.files.delete('/records/wager-results-2026-10-03.json');
  assert.ok((await publicResultRows(f.options)).every(r=>r.result==='PENDING'));
  f.files.set('/records/wager-results-2026-10-03.json',{version:2,wagers:{}});
  await assert.rejects(publicResultRows(f.options),/Invalid canonical wager ledger/);
});

test('unpublished rows are excluded and a missing verification timestamp cannot count',async()=>{
  const row=original();const f=fixture([row]);const ledger=f.files.get('/records/wager-results-2026-10-03.json');
  ledger.wagers[`${row.pick_id}-W001`].result.result_verified_at='';
  const rows=await publicResultRows({...f.options,rows:[row,{...original('unpublished'),published_at:''}]});
  const snapshot=buildPublicResults(rows,'2026-10-04');assert.equal(snapshot.settled,2);assert.equal(snapshot.pending,1);
});


test('a pending single can reuse its matching saved child grade without creating a second entry',async()=>{
  const row=original(); const f=fixture([row]);
  const packet={pick_id:row.pick_id,analysis:{extraction:{lossless_text_terms:true,plays:[{selection:row.selection}]}}};
  f.files.set(sourcePacketPath('/packets',row.pick_id),packet);
  const child=expandPublication(row,packet)[0];
  f.files.set('/records/wager-results-2026-10-03.json',{version:1,wagers:{[child.pick_id]:{fingerprint:wagerFingerprint(child),result:grade('W')}}});
  const rows=await publicResultRows(f.options);
  assert.equal(rows.length,1);assert.equal(rows[0].pick_id,row.pick_id);assert.equal(rows[0].result,'W');
  assert.equal(buildPublicResults(rows,'2026-10-04').overall.wins,1);
});


test('identical reposted calls count once per source and operating date',async()=>{
 const a=original(),b=original('20261003-002-X'); const f=fixture([a,b]);
 const rows=await publicResultRows(f.options);assert.equal(rows.length,3);
 assert.deepEqual(buildPublicResults(rows,'2026-10-04').overall,{wins:1,losses:1,pushes:1,voids:0});
 const c={...original('20261003-003-X'),source_name:'Another capper'};const separate=fixture([a,c]);
 assert.equal((await publicResultRows(separate.options)).length,6);
});

test('conflicting verified grades of an identical repost stay pending',async()=>{
 const a=original(),b=original('20261003-002-X'); const f=fixture([a,b]);
 f.files.get('/records/wager-results-2026-10-03.json').wagers[`${b.pick_id}-W001`].result=grade('L');
 const rows=await publicResultRows(f.options);assert.equal(rows.length,3);assert.equal(rows[0].result,'PENDING');
 const snapshot=buildPublicResults(rows,'2026-10-04');assert.equal(snapshot.pending,1);assert.deepEqual(snapshot.overall,{wins:0,losses:1,pushes:1,voids:0});
});
