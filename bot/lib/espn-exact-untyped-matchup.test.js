const test=require('node:test');const assert=require('node:assert/strict');const {gradePickFromEspn}=require('./espn-grading');const {normalizeSelection,combinationSelections}=require('./wager-terms');
const event={id:'401909961',status:{type:{completed:true}},competitions:[{competitors:[{team:{displayName:'Boston Celtics',shortDisplayName:'Celtics',abbreviation:'BOS'}},{team:{displayName:'Philadelphia 76ers',shortDisplayName:'76ers',abbreviation:'PHI'}}]}]};
const summary={header:{competitions:[{id:event.id,status:{type:{completed:true}}}]},boxscore:{players:[{statistics:[{keys:['rebounds'],athletes:[{athlete:{displayName:'Paul George'},stats:['5']}]}]}]}};
const row={pick_id:'20261110-038-01-X-W001',operating_date:'2026-11-10',selection:'Paul George o4.5 Rebounds (-115)',event:'Boston Celtics at Philadelphia 76ers',league:'',sport:'',league_from_group:true,market:'Rebounds',published_line:'4.5 Rebounds',result:'PENDING'};
const fetcher=(duplicate=false)=>async url=>new Response(JSON.stringify(url.includes('/summary?')?summary:{events:url.includes('/basketball/nba/')||duplicate&&url.includes('/basketball/wnba/')?[event]:[]}));
test('exact original matchup resolves missing sport without guessing player league',async()=>assert.equal((await gradePickFromEspn(row,{fetchImpl:fetcher()})).result,'W'));
test('same matchup in multiple leagues remains pending',async()=>assert.equal((await gradePickFromEspn(row,{fetchImpl:fetcher(true)})).status,'PENDING'));
test('one matching opponent alone is not sufficient',async()=>assert.equal((await gradePickFromEspn({...row,event:'Boston Celtics'},{fetchImpl:fetcher()})).status,'PENDING'));
test('only explicit single-team spread/slash-price and exact moneyline wrapper normalize',()=>{
 assert.equal(normalizeSelection('(4u) Wisconsin -25/-120'),'Wisconsin -25 -120');
 assert.equal(combinationSelections(normalizeSelection('(4u) Wisconsin -25/-120')).length,1);
 assert.equal(normalizeSelection('Moneyline of the day - BOSTON CELTICS -125'),'BOSTON CELTICS -125');
 assert.equal(normalizeSelection('Wisconsin -25 / Ohio +2'),'Wisconsin -25 / Ohio +2');
 assert.equal(combinationSelections(normalizeSelection('Wisconsin -25 / Ohio +2')).length,2);
});
test('explicit unsupported league cannot silently fall back to another sport',async()=>assert.equal((await gradePickFromEspn({...row,league:'UNSUPPORTED-LEAGUE'},{fetchImpl:fetcher()})).status,'PENDING'));
