const test=require('node:test'),assert=require('node:assert/strict');
const {gradePickFromEspn}=require('./espn-grading');
const {normalizeSelection,combinationSelections}=require('./wager-terms');
const row=selection=>({selection,league:'NBA',sport:'Basketball',event:'Home Team at Away Team',operating_date:'2026-11-11'});
function provider(name,values,{final=true,dnp=false,duplicate=false}={}){
 const competitors=[{team:{displayName:'Home Team'}},{team:{displayName:'Away Team'}}];
 const entry={athlete:{id:'123',displayName:name},didNotPlay:dnp,stats:Object.values(values).map(String)};
 const event={id:'401909974',competitions:[{competitors}],status:{type:{completed:final}}};
 const summary={header:{competitions:[{id:event.id,competitors,status:{type:{completed:final}}}]},boxscore:{players:[{statistics:[{keys:Object.keys(values),athletes:duplicate?[entry,entry]:[entry]}]}]}};
 return async url=>new Response(JSON.stringify(url.includes('summary?')?summary:{events:[event]}));
}
test('actual abbreviated recap terms stay one market and normalize only player-stat suffix',async()=>{
 for(const [name,terms,line]of [['Draymond Green','Over 9.5 Pts + Reb',9.5],['Michael Porter Jr.','25+ Pts + Reb',24.5]]){
 const selection=`${name} ${terms}`;assert.equal(combinationSelections(selection).length,1);
 const output=await gradePickFromEspn(row(selection),{fetchImpl:provider(name,{points:20,rebounds:5})});
 assert.equal(output.result,'W');assert.match(output.outcome,/25 points \+ rebounds/);
 }
 assert.equal(normalizeSelection('Reb Williams Over 1.5 Pts'),'Reb Williams Over 1.5 points');
 assert.equal(combinationSelections('Draymond Green Over 9.5 Pts + Reb + Celtics ML').length,2);
});
test('milestones retain exact threshold; missing/unsupported sum stays pending',async()=>{
 for(const [points,result]of [[19,'L'],[20,'W']])assert.equal((await gradePickFromEspn(row('Michael Porter Jr. 25+ Pts + Reb'),{fetchImpl:provider('Michael Porter Jr.',{points,rebounds:5})})).result,result);
 for(const selection of ['Draymond Green Over 9.5 Pts + Reb','Draymond Green Over 9.5 Pts + Blocks'])assert.equal((await gradePickFromEspn(row(selection),{fetchImpl:provider('Draymond Green',{points:20})})).status,'PENDING');
});
test('positive double-double uses five standard categories and inclusive ten boundary',async()=>{
 for(const [values,result]of [[{points:10,rebounds:10,assists:1,steals:0,blocks:0},'W'],[{points:9,rebounds:10,assists:9,steals:0,blocks:0},'L'],[{points:20,rebounds:10,assists:10,steals:0,blocks:0},'W']]){
 const grade=await gradePickFromEspn(row('Example Player Double-Double (+100)'),{fetchImpl:provider('Example Player',{minutes:30,...values})});assert.equal(grade.result,result);
 }
});
test('double-double blocks nonfinal, DNP, missing stat, missing participation, duplicate identity and unsupported side',async()=>{
 const all={minutes:30,points:10,rebounds:10,assists:0,steals:0,blocks:0};
 for(const [values,options]of [[all,{final:false}],[all,{dnp:true}],[all,{duplicate:true}],[{...all,minutes:''},{}],[{minutes:30,points:10,rebounds:10},{}]])assert.equal((await gradePickFromEspn(row('Example Player Double Double'),{fetchImpl:provider('Example Player',values,options)})).status,'PENDING');
 assert.equal((await gradePickFromEspn(row('Example Player Double Double NO'),{fetchImpl:provider('Example Player',all)})).status,'PENDING');
});

test('actual to-record double-double syntax is supported but wrong event athlete is not substituted', async()=>{
 const selection='Walker Kessler to record a double-double';
 const values={minutes:30,points:10,rebounds:10,assists:0,steals:0,blocks:0};
 assert.equal((await gradePickFromEspn({...row(selection),market:'Double-Double',published_line:'0.5 DD'},{fetchImpl:provider('Walker Kessler',values)})).result,'W');
 assert.equal((await gradePickFromEspn(row(selection),{fetchImpl:provider('Other Player',values)})).status,'PENDING');
});
test('Total sums and Pts+Ast preserve thresholds and single-child stale parlay metadata',async()=>{
 for(const [name,terms]of [['Alperen Sengun','25+ Pts + Ast'],['Andrew Nembhard','Over 23.5 Total Points + Assists (-103) 1u'],['Jeremiah Fears','Over 26.5 Total Points + Assists + Rebounds (-120) 1u.']]){
 const grade=await gradePickFromEspn({...row(`${name} ${terms}`),pick_id:'20261111-128-02-X',market:'2-leg parlay'},{fetchImpl:provider(name,{points:20,assists:6,rebounds:7})});
 assert.equal(grade.result,'W');
 }
});
