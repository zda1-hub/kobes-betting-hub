const test=require('node:test'),assert=require('node:assert/strict');
const {gradePickFromEspn}=require('./espn-grading');
const selection='CLEVELAND CAVS (+4.5) over NY KNICKS (3-UNITS)';
function fetcher({duplicate=false,wrongOpponent=false,final=true,badIdentity=false}={}){
 const competitors=[{team:{id:'5',location:'Cleveland',displayName:badIdentity?'Other Cavaliers':'Cleveland Cavaliers',shortDisplayName:'Cavaliers',name:'Cavaliers',abbreviation:'CLE'},score:'115'},{team:{id:'18',location:'New York',displayName:'New York Knicks',shortDisplayName:'Knicks',name:'Knicks',abbreviation:wrongOpponent?'XX':'NY'},score:'107'}];
 const event={id:'401909967',competitions:[{competitors}],status:{type:{completed:final}}};
 return async url=>new Response(JSON.stringify(url.includes('summary?')?{header:{competitions:[{id:event.id,competitors,status:{type:{completed:final}}}]}}:{events:url.includes('/basketball/nba/')?(duplicate?[event,{...event,id:'duplicate'}]:[event]):[]}));
}
test('explicit opponent spread requires official composite aliases and preserves exact +4.5',async()=>{
 const grade=await gradePickFromEspn({selection,operating_date:'2026-11-11',league_from_group:true},{fetchImpl:fetcher()});
 assert.equal(grade.result,'W');assert.match(grade.outcome,/115.*107.*\+4.5/);
});
test('wrong opponent, altered team identity, duplicate event and nonfinal stay pending',async()=>{
 for(const options of [{wrongOpponent:true},{badIdentity:true},{duplicate:true},{final:false}]){
 const grade=await gradePickFromEspn({selection,operating_date:'2026-11-11',league_from_group:true},{fetchImpl:fetcher(options)});assert.equal(grade.status,'PENDING');}
 const grade=await gradePickFromEspn({selection:selection.replace('NY KNICKS','NY RANGERS'),operating_date:'2026-11-11',league_from_group:true},{fetchImpl:fetcher()});assert.equal(grade.status,'PENDING');
});
test('Cavs brand alias never overrides an explicit different league or guesses arbitrary city nickname',async()=>{
 for(const change of [{league:'NCAAF',sport:'NCAAF'},{selection:selection.replace('CLEVELAND CAVS','CLEVELAND BIRDS')}]){
 const grade=await gradePickFromEspn({selection,operating_date:'2026-11-11',...change},{fetchImpl:fetcher()});assert.equal(grade.status,'PENDING');}
});
