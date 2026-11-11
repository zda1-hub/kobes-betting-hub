const test=require('node:test');const assert=require('node:assert/strict');const {gradePickFromEspn}=require('./espn-grading');
function fixture(id,first,second,a,b){const event={id,status:{type:{completed:true}},competitions:[{competitors:[{team:{id:'1',displayName:first,shortDisplayName:first,location:first},score:String(a),winner:a>b},{team:{id:'2',displayName:second,shortDisplayName:second,location:second},score:String(b),winner:b>a}]}]};return{event,summary:{header:{competitions:[{id,status:{type:{completed:true}},competitors:event.competitions[0].competitors}]}}};}
const ill=fixture('401913527','Illinois','Texas Tech',78,84),kent=fixture('401866459','Kent State','Bowling Green',28,33);
const row={operating_date:'2026-11-10',league:'NCAAB',result:'PENDING'};
const fetcher=(f,events=[f.event])=>async url=>new Response(JSON.stringify(url.includes('/summary?')?f.summary:{events}));
test('moneyline price followed by explicit opponent validates both teams',async()=>{
 assert.equal((await gradePickFromEspn({...row,selection:'ILLINOIS (-130) over Texas Tech (4-UNITS)'},{fetchImpl:fetcher(ill)})).result,'L');
 assert.equal((await gradePickFromEspn({...row,selection:'ILLINOIS (-130) over Wrong Team (4-UNITS)'},{fetchImpl:fetcher(ill)})).status,'PENDING');
});
test('duplicate opponent-bearing moneyline candidates remain pending',async()=>{
 const second=structuredClone(ill.event);second.id='duplicate';assert.equal((await gradePickFromEspn({...row,selection:'ILLINOIS (-130) over Texas Tech (4-UNITS)'},{fetchImpl:fetcher(ill,[ill.event,second])})).status,'PENDING');
});
test('college terminal State abbreviation resolves only an exact official location',async()=>{
 assert.equal((await gradePickFromEspn({...row,league:'NCAAF',selection:'Kent St. vs Bowling Green Under 44.5 (-110) 1u'},{fetchImpl:fetcher(kent)})).result,'L');
 assert.equal((await gradePickFromEspn({...row,league:'NCAAF',selection:'Kent vs Bowling Green Under 44.5 (-110) 1u'},{fetchImpl:fetcher(kent)})).status,'PENDING');
});
test('State abbreviation collision is not resolved arbitrarily',async()=>{
 const collision=structuredClone(kent.event);collision.id='other';collision.competitions[0].competitors[0].team={displayName:'Kent St',location:'Kent St',shortDisplayName:'Kent St'};
 assert.equal((await gradePickFromEspn({...row,league:'NCAAF',selection:'Kent St. vs Bowling Green Under 44.5 (-110) 1u'},{fetchImpl:fetcher(kent,[kent.event,collision])})).status,'PENDING');
});
