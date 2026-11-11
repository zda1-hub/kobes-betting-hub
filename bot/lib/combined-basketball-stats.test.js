const test=require('node:test'),assert=require('node:assert/strict');
const {combinationSelections}=require('./wager-terms');
const {gradePickFromEspn,statSpec}=require('./espn-grading');
const cases=[
 ['Anthony Black over 9.5 rebounds + assists','Anthony Black','401909964',{points:26,rebounds:7,assists:5},'W','12 rebounds + assists'],
 ['Brook Lopez over 17.5 points + rebounds','Brook Lopez','401909962',{points:8,rebounds:4,assists:1},'L','12 points + rebounds'],
 ['Ace Bailey Over 21.5 Total Points + Rebounds (-125) 0.5u','Ace Bailey','401909963',{points:23,rebounds:7,assists:2},'W','30 points + rebounds']
];
// Exact event/stat values checked against ESPN summary endpoints Nov 11.
function fixture(name,id,values){
 const competitors=[{team:{displayName:'Home Team'}},{team:{displayName:'Away Team'}}];
 const event={id,competitions:[{competitors}],status:{type:{completed:true}}};
 const summary={header:{competitions:[{id,competitors,status:{type:{completed:true}}}]},boxscore:{players:[{statistics:[{keys:Object.keys(values),athletes:[{athlete:{id:'123',displayName:name},stats:Object.values(values).map(String)}]}]}]}};
 return async url=>({ok:true,json:async()=>url.includes('/summary?')?summary:{events:[event]}});
}
for(const [selection,name,id,values,result,outcome] of cases)test(`sums exact ${name} component stats without creating a parlay`,async()=>{
 assert.deepEqual(combinationSelections(selection),[selection]);
 const grade=await gradePickFromEspn({selection,league:'NBA',event:'Home Team at Away Team',operating_date:'2026-11-10'},{fetchImpl:fixture(name,id,values)});
 assert.equal(grade.status,'GRADED');assert.equal(grade.result,result);assert.equal(grade.outcome,`${name}: ${outcome}`);
 assert.equal(grade.source,`https://www.espn.com/nba/game/_/gameId/${id}`);
});
test('real separate wagers still split and combined market stays one leg',()=>{
 assert.deepEqual(combinationSelections('Celtics ML + Knicks ML'),['Celtics ML','Knicks ML']);
 assert.deepEqual(combinationSelections('Anthony Black over 9.5 rebounds + assists + Celtics ML'),['Anthony Black over 9.5 rebounds + assists','Celtics ML']);
});
test('missing component remains pending, never zero or first-stat-only',async()=>{
 const selection=cases[0][0];const grade=await gradePickFromEspn({selection,league:'NBA',event:'Home Team at Away Team',operating_date:'2026-11-10'},{fetchImpl:fixture('Anthony Black','401909964',{rebounds:7})});
 assert.equal(grade.status,'PENDING');
});
test('PRA uses all three components and refuses duplicated or unsupported sums',()=>{
 const entry={name:'Anthony Black',category:'basketball',values:{points:'26',rebounds:'7',assists:'5'}};
 assert.deepEqual(statSpec({selection:'Anthony Black over 30.5 points + rebounds + assists'},[entry]).key,['points','rebounds','assists']);
 for(const terms of ['points + points','points + rebounds + assists + points','points + rebounds + blocks','points + blocks','blocks + points + rebounds','blocks + points'])assert.equal(statSpec({selection:`Anthony Black over 30.5 ${terms}`},[entry]),null);
});
