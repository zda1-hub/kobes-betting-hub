const test=require('node:test');const assert=require('node:assert/strict');const {gradePickFromEspn}=require('./espn-grading');
const event={id:'401892685',status:{type:{completed:true}},competitions:[{competitors:[{team:{id:'OTT',displayName:'Ottawa Senators',shortDisplayName:'Senators',location:'Ottawa'},score:'2',winner:false},{team:{id:'WSH',displayName:'Washington Capitals',shortDisplayName:'Capitals',location:'Washington'},score:'3',winner:true}]}]};
const summary={header:{competitions:[{id:event.id,status:{type:{completed:true}},competitors:event.competitions[0].competitors}]}};
const row={pick_id:'20261110-183-X-W001',operating_date:'2026-11-10',selection:'Ottawa (-130) 0.5u',league:'NHL',sport:'NHL',league_from_group:false,result:'PENDING'};
const fetcher=(events=[event])=>async url=>new Response(JSON.stringify(url.includes('/summary?')?summary:{events:url.includes('/hockey/nhl/')?events:[]}));
test('explicit NHL exact location and parenthesized signed price with bare units resolve original wager',async()=>assert.equal((await gradePickFromEspn(row,{fetchImpl:fetcher()})).result,'L'));
test('duplicate explicit league location candidates remain pending',async()=>{const d=structuredClone(event);d.id='other';assert.equal((await gradePickFromEspn(row,{fetchImpl:fetcher([event,d])})).status,'PENDING');});
test('no location expansion when league is absent or only inherited from multi-sport group',async()=>{
 for(const patch of [{league:'',sport:''},{league_from_group:true}])assert.equal((await gradePickFromEspn({...row,...patch},{fetchImpl:fetcher()})).status,'PENDING');
});
test('no grade for unpriced bare teams or malformed brackets',async()=>{
 for(const selection of ['Ottawa 0.5u','Ottawa (-130 0.5u','Ottawa -130) 0.5u'])assert.equal((await gradePickFromEspn({...row,selection},{fetchImpl:fetcher()})).status,'PENDING');
});

test('small signed number remains spread, not moneyline price',async()=>{const r=await gradePickFromEspn({...row,selection:'Ottawa (-13) 0.5u'},{fetchImpl:fetcher()});assert.match(r.outcome,/\(-13\)/);});
test('Phoenix price shorthand does not select first of multiple same-date college teams',async()=>{
 const events=['Elon','Green Bay'].map((school,i)=>({id:String(i),status:{type:{completed:true}},competitions:[{competitors:[{team:{displayName:`${school} Phoenix`,shortDisplayName:school,name:'Phoenix',location:school}},{team:{displayName:`Opponent ${i}`}}]}]}));
 const f=async url=>new Response(JSON.stringify({events:url.includes('/basketball/mens-college-basketball/')?events:[]}));
 assert.equal((await gradePickFromEspn({...row,selection:'Phoenix (-156) 0.5u',league:'',sport:'',league_from_group:true},{fetchImpl:f})).status,'PENDING');
});
