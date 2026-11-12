const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {expandPublication,wagerFingerprint}=require('./wager-ledger');
const {recoverReviewedSourceHeadings}=require('./reviewed-source-heading-recovery');
const {gradePickFromEspn}=require('./espn-grading');
const terms=['Central Michigan -4 1st qtr -110 1.5u','Umass TT over 9.5 1H 1.5U -110','West Georgia ML 2u -125','Indiana state ML/ VMI ML 1.5U -106','Santa Clara ML 1.5U -120','Ducks vs predators over 1.5 1p -145 1.5U','Nuggets -11H 1.5U -115'];
const row={pick_id:'20261111-277-X',operating_date:'2026-11-11',selection:terms[0],post_reference:'https://discord.com/channels/1215407647155683358/1539055850075852911/1570230562252394609',published_by:'1539103276107046955',approver:'1209660006383755265',approved_at:'2026-11-12T00:15:12.319Z',published_at:'2026-11-12T00:15:14.413Z',sport:'NCAAF',league:'NCAAF'};
const packet={pick_id:row.pick_id,source:{post_id:'2120669913547227589',post_url:'https://x.com/BettingBuddyy/status/2120669913547227589',posted_at:'2026-11-12T00:08:02Z',exclusive_group_key:'2120669913547227589:1',text:fs.readFileSync(__dirname+'/source277-fixture.txt','utf8')},analysis:{extraction:{sport:'NCAAF',league:'NCAAF',lossless_text_terms:true,plays:terms.map(selection=>({selection}))}}};
test('exact approved source recovers only UMass child, preserves siblings and original packet',()=>{
 const before=JSON.stringify(packet);const recovered=recoverReviewedSourceHeadings(row,packet);assert.equal(recovered.plays[1].league,'NCAAF');
 const after=expandPublication(row,packet),original=expandPublication(row,{...packet,source:{...packet.source,text:'not reviewed'}});
 for(let i=0;i<terms.length;i++)if(i!==1)assert.equal(wagerFingerprint(after[i]),wagerFingerprint(original[i]));
 assert.equal(after[1].league_from_group,false);assert.equal(after[6].selection,'Nuggets -11H 1.5U -115');assert.equal(JSON.stringify(packet),before);
 for(const changed of [{...packet,source:{...packet.source,text:packet.source.text+'changed'}},{...packet,source:{...packet.source,exclusive_group_key:'wrong'}}])assert.equal(recoverReviewedSourceHeadings(row,changed),null);
 assert.equal(recoverReviewedSourceHeadings({...row,post_reference:row.post_reference+'1'},packet),null);
});
test('first-half team total uses only first two football quarters; absent period data stays pending',async()=>{
 const child=expandPublication(row,packet)[1];
 for(const [lineScores,expected]of [[['0','0','14','7'],'L'],[['7','3','0','0'],'W'],[['0'],'PENDING']]){
 const competitors=[{team:{id:'113',displayName:'Massachusetts Minutemen',shortDisplayName:'UMass',name:'Minutemen'},score:'21',linescores:lineScores.map(displayValue=>({displayValue}))},{team:{id:'2649',displayName:'Toledo Rockets',shortDisplayName:'Toledo',name:'Rockets'},score:'24',linescores:[7,17,0,0].map(value=>({value}))}];
 const event={id:'401866463',competitions:[{competitors}],status:{type:{completed:true}}};
 const fetchImpl=async url=>new Response(JSON.stringify(url.includes('summary?')?{header:{competitions:[{id:event.id,competitors,status:{type:{completed:true}}}]}}:{events:[event]}));
 const grade=await gradePickFromEspn(child,{fetchImpl});assert.equal(expected==='PENDING'?grade.status:grade.result,expected);
 }
});
