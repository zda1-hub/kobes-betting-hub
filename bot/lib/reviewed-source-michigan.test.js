const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./reviewed-source-nov11.test');
const {expandPublication,wagerFingerprint,gradeWagerRows,sourcePacketPath}=require('./wager-ledger');
test('251 Michigan retains pre-recovery fingerprint and cached verified grade; genuine terms changes still block',async()=>{
 const {row,packet}=fixture(251);row.status='PUBLISHED';
 // A source outside the reviewed allowlist follows the original lossless
 // expansion, reproducing the pre-409 child metadata without modifying terms.
 const original=structuredClone(packet);original.source.post_id='not-reviewed';
 const before=expandPublication(row,original)[2], after=expandPublication(row,packet)[2];
 assert.equal(after.league_from_group,true);assert.equal(after.league,'NBA');assert.equal(after.sport,'NBA');
 assert.equal(wagerFingerprint(after),wagerFingerprint(before));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kbh-michigan-'));
 try {const file=path.join(dir,'ledger.json'),src=sourcePacketPath(dir,row.pick_id);await fs.mkdir(path.dirname(src),{recursive:true});await fs.writeFile(src,JSON.stringify(packet));
 await fs.writeFile(file,JSON.stringify({version:1,wagers:{[before.pick_id]:{fingerprint:wagerFingerprint(before),result:{status:'GRADED',result:'W',result_verified_source:'Verified final result: https://www.espn.com/mens-college-basketball/game/_/gameId/401909524'}}}}));
 let michiganCalls=0;const run=()=>gradeWagerRows({rows:[row],date:row.operating_date,root:dir,file,grade:async r=>{if(r.pick_id===before.pick_id)michiganCalls++;return {status:'PENDING'};}});
 const settled=await run();assert.equal(settled.rows[2].result,'W');assert.equal(michiganCalls,0);
 packet.analysis.extraction.plays[2].selection='Michigan ML (3u)';await fs.writeFile(src,JSON.stringify(packet));const changed=await run();assert.equal(changed.rows[2].result,'PENDING');assert.match(changed.attempts.get(before.pick_id).reason,/terms changed/);assert.equal(michiganCalls,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
