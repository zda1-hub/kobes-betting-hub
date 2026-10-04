const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { recoverResultsBacklog } = require('./results-backlog');
const { publicResultRows } = require('./public-result-rows');
const { sourcePacketPath } = require('./wager-ledger');
const { buildPublicResults } = require('./public-results');
const row = (id='20260901-001-X',date='2026-09-01')=>({pick_id:id,operating_date:date,selection:`${id} moneyline`,status:'PUBLISHED',result:'PENDING',published_at:`${date}T20:00:00Z`,post_reference:'https://discord.com/channels/1/2/3'});
async function fixture(t, rows, plays) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'kbh-backlog-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const root=path.join(directory,'packets'),calls=[],updates=[];
 if(plays) for(const r of rows){const file=sourcePacketPath(root,r.pick_id);if(!file)continue;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify({pick_id:r.pick_id,analysis:{extraction:{lossless_text_terms:true,plays}}}));}
 return {directory,root,calls,updates,options:{rows,root,directory,beforeDate:'2026-10-04',grade:async r=>{calls.push(r.pick_id);return {status:'GRADED',result:'W',source:'https://www.espn.com/game/1',outcome:'Final'};},updatePick:async(id,patch)=>updates.push({id,patch})}};
}

test('single source parent selection grades one canonical child and public row counts once',async t=>{
 const r=row();const f=await fixture(t,[r],[{selection:r.selection}]);const report=await recoverResultsBacklog(f.options);
 assert.deepEqual(f.calls,[`${r.pick_id}-W001`]);assert.equal(f.updates.length,0);assert.equal(report.recovered,1);
 const ledger=JSON.parse(await fs.readFile(path.join(f.directory,'wager-results-2026-09-01.json'),'utf8'));
 assert.equal(Object.keys(ledger.wagers).length,1);
 const publicRows=await publicResultRows(f.options);assert.equal(publicRows.length,1);assert.equal(publicRows[0].pick_id,r.pick_id);assert.equal(buildPublicResults(publicRows,'2026-10-04').overall.wins,1);
});

test('one selected child never enables unselected grouped siblings',async t=>{
 const r=row();const f=await fixture(t,[r],[{selection:r.selection},{selection:'B +3.5'},{selection:'C over 2.5'}]);
 const report=await recoverResultsBacklog({...f.options,limit:1});assert.deepEqual(f.calls,[`${r.pick_id}-W001`]);assert.equal(report.attempted,1);assert.equal(report.selected,1);assert.equal(f.updates.length,0);
 const rows=await publicResultRows(f.options);assert.deepEqual(rows.map(r=>r.result),['W','PENDING','PENDING']);
});

test('missing or unsafe source packets never grade legacy individual-scoped parents',async t=>{
 const r={...row(),wager_scope:'individual'};const f=await fixture(t,[r]);
 let report=await recoverResultsBacklog(f.options);assert.equal(report.attempted,0);assert.equal(f.calls.length,0);assert.equal(f.updates.length,0);
 const file=sourcePacketPath(f.root,r.pick_id);await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.writeFile(file,JSON.stringify({pick_id:r.pick_id,analysis:{extraction:{lossless_text_terms:false,plays:[{selection:r.selection},{selection:'B'}]}}}));
 report=await recoverResultsBacklog(f.options);assert.equal(report.attempted,0);assert.equal(f.updates.length,0);
});

test('ordinary singles use canonical updater; cutoff and rotating budget bound historical attempts',async t=>{
 const rows=[row('older-a','2026-08-01'),row('older-b','2026-09-01'),row('current','2026-10-04'),row('future','2026-10-05')];const f=await fixture(t,rows);
 const report=await recoverResultsBacklog({...f.options,limit:1,cursor:1});assert.deepEqual(f.calls,['older-b']);assert.deepEqual(f.updates.map(r=>r.id),['older-b']);assert.equal(report.pendingBefore,2);assert.equal(report.nextCursor,0);assert.equal(report.recovered,1);
});

test('verified picks never invoke a grading provider',async t=>{
 const r={...row('verified'),result:'L',status:'GRADED',result_verified_source:'https://www.espn.com/game/1',result_verified_at:'2026-09-02T03:00:00Z'};const f=await fixture(t,[r]);const report=await recoverResultsBacklog(f.options);
 assert.equal(report.pendingBefore,0);assert.equal(f.calls.length,0);assert.equal(f.updates.length,0);
});

test('60 second deadline stops subsequent provider calls',async t=>{
 const f=await fixture(t,[row('a'),row('b')]);let time=0;const grade=f.options.grade;
 const report=await recoverResultsBacklog({...f.options,now:()=>time,grade:async r=>{const result=await grade(r);time=60000;return result;}});
 assert.deepEqual(f.calls,['a']);assert.equal(report.attempted,1);assert.equal(report.selected,2);
});

test('unverified provider outcomes cannot update canonical results',async t=>{
 const f=await fixture(t,[row('ordinary')]);const report=await recoverResultsBacklog({...f.options,grade:async()=>({status:'GRADED',result:'W'})});
 assert.equal(report.recovered,0);assert.equal(f.updates.length,0);
});

test('invalid budgets, cursors and dates fail before grading or writes',async t=>{
 const f=await fixture(t,[row('ordinary')]);
 for(const patch of [{limit:0},{limit:1.5},{limit:101},{cursor:-1},{cursor:0.5},{beforeDate:'bad'}]) await assert.rejects(recoverResultsBacklog({...f.options,...patch}));
 assert.equal(f.calls.length,0);assert.equal(f.updates.length,0);await assert.rejects(fs.access(path.join(f.directory,'results-backlog-last-run.json')));
});

test('changed published terms block reuse and automatic regrading of saved child evidence',async t=>{
 const r=row();const f=await fixture(t,[r],[{selection:r.selection},{selection:'B +3.5'}]);
 await recoverResultsBacklog({...f.options,limit:1});f.calls.length=0;
 const file=sourcePacketPath(f.root,r.pick_id);const packet=JSON.parse(await fs.readFile(file,'utf8'));
 packet.analysis.extraction.plays[0].line='+1.5';await fs.writeFile(file,JSON.stringify(packet));
 const report=await recoverResultsBacklog({...f.options,limit:1});assert.equal(report.attempted,0);assert.equal(report.recovered,0);assert.equal(f.calls.length,0);
 const publicRows=await publicResultRows(f.options);assert.equal(publicRows[0].result,'PENDING');
});
