const test=require('node:test'),assert=require('node:assert/strict');
const {gradePickFromEspn,statSpec}=require('./espn-grading');
const {normalizeSelection,combinationSelections}=require('./wager-terms');
const selection='Rachaad White O52.5 Rushing + Receiving Yards (-118) 1U';
function fixture({rush=47,receiving=5,missing=false,duplicate=false,otherId=false,final=true}={}){
 const competitors=[{team:{displayName:'Washington Commanders'}},{team:{displayName:'New York Giants'}}];
 const event={id:'401873052',competitions:[{competitors}],status:{type:{completed:final}}};
 const group=(name,key,value,id='4697815')=>({name,keys:[key],athletes:[{athlete:{id,displayName:'Rachaad White'},stats:[String(value)]}]});
 const statistics=[group('rushing','rushingYards',rush),...(!missing?[group('receiving','receivingYards',receiving,otherId?'999':'4697815')]:[])];
 if(duplicate)statistics.push(group('receiving','receivingYards',receiving));
 return async url=>new Response(JSON.stringify(url.includes('summary?')?{header:{competitions:[{id:event.id,competitors,status:{type:{completed:final}}}]},boxscore:{players:[{statistics}]}}:{events:[event]}));
}
const row={selection,operating_date:'2026-11-12',league:'NFL',event:'Washington Commanders at New York Giants'};
test('rushing+receiving remains one market, sums separate explicit categories with exact line',async()=>{
 assert.equal(combinationSelections(normalizeSelection(selection)).length,1);
 for(const [receiving,result]of [[5,'L'],[6,'W'],[0,'L']]){const grade=await gradePickFromEspn(row,{fetchImpl:fixture({receiving})});assert.equal(grade.result,result);assert.match(grade.outcome,new RegExp(`${47+receiving} rushing \\+ receiving yards`));}
 assert.equal(combinationSelections(normalizeSelection(selection+' + Giants ML')).length,2);
});
test('missing category is not zero; mismatched athlete, duplicate category and nonfinal remain pending',async()=>{
 for(const options of [{missing:true},{otherId:true},{duplicate:true},{final:false}])assert.equal((await gradePickFromEspn(row,{fetchImpl:fixture(options)})).status,'PENDING');
 for(const bad of ['Rushing + Rushing Yards','Rushing + Receiving Yards + Passing Yards'])assert.equal((await gradePickFromEspn({...row,selection:selection.replace('Rushing + Receiving Yards',bad)},{fetchImpl:fixture()})).status,'PENDING');
});
test('exact sportsbook-price annotation cannot turn Alex Sarr points into baseball home runs',()=>{
 const original='1u - NBA: Alex Sarr (WAS) UNDER 9.5 Points (-110 @ BOV, -111 @ DK, -125 @ HR, -127 @ CZR)';
 const normalized=normalizeSelection(original);
 const spec=statSpec({selection:normalized},[{name:'Alex Sarr',athleteId:'5160992',category:'basketball',values:{points:'30'}}]);
 assert.equal(spec.category,'basketball');assert.equal(spec.key,'points');assert.ok(original.includes('-125 @ HR'));
 assert.ok(normalizeSelection('Player Over 1.5 HR (-110)').includes('HR')); // real home run market stays
 assert.ok(normalizeSelection('Player Over 1.5 Points (not a price @ HR)').includes('not a price'));
});
test('documented Okonkwo alias requires exact NFL athlete ID, preserves terms and final-only grading',async()=>{
 const original={selection:'Chigoziem Okonkwo Over 14.5 Longest Reception (-130) 1u',operating_date:'2026-11-12'};
 const before=JSON.stringify(original);
 const run=async({id='4360635',final=true,stat='11',path='football/nfl'}={})=>{
  const competitors=[{team:{displayName:'Washington Commanders'}},{team:{displayName:'New York Giants'}}];
  const event={id:'401873052',competitions:[{competitors}],status:{type:{completed:final}}};
  const summary={header:{competitions:[{id:event.id,competitors,status:event.status}]},boxscore:{players:[{statistics:[{name:'receiving',keys:['longReception'],athletes:[{athlete:{id,displayName:'Chig Okonkwo'},stats:[stat]}]}]}]}};
  return gradePickFromEspn(original,{fetchImpl:async url=>new Response(JSON.stringify(url.includes('summary?')?summary:{events:url.includes(path)?[event]:[]}))});
 };
 assert.equal((await run()).result,'L');
 for(const options of [{id:'999'},{final:false},{stat:''},{path:'football/college-football'}])assert.equal((await run(options)).status,'PENDING');
 assert.equal(JSON.stringify(original),before);
 const e=[{name:'Chig Okonkwo',athleteId:'4360635',category:'receiving',values:{longReception:'11'}}];
 assert.equal(statSpec(original,e),null);
 assert.equal(statSpec(original,e,{path:'football/college-football'}),null);
 assert.ok(statSpec(original,e,{path:'football/nfl'}).key.includes('longReception'));
});
test('Sarr full grading uses points, not sportsbook HR, and leaves original selection intact',async()=>{
 const original={selection:'1u - NBA: Alex Sarr (WAS) UNDER 9.5 Points (-110 @ BOV, -111 @ DK, -125 @ HR, -127 @ CZR)',league:'NBA',event:'Detroit Pistons at Washington Wizards',operating_date:'2026-11-12'};
 const before=JSON.stringify(original);
 const competitors=[{team:{displayName:'Detroit Pistons'}},{team:{displayName:'Washington Wizards'}}];
 const event={id:'401909977',competitions:[{competitors}],status:{type:{completed:true}}};
 const summary={header:{competitions:[{id:event.id,competitors,status:event.status}]},boxscore:{players:[{statistics:[{name:'basketball',keys:['points'],athletes:[{athlete:{id:'5160992',displayName:'Alex Sarr'},stats:['30']}]}]}]}};
 const grade=await gradePickFromEspn(original,{fetchImpl:async url=>new Response(JSON.stringify(url.includes('summary?')?summary:{events:[event]}))});
 assert.equal(grade.result,'L');assert.equal(grade.outcome,'Alex Sarr: 30 points');assert.equal(JSON.stringify(original),before);
});
