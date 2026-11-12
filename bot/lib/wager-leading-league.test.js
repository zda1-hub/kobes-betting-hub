const test=require('node:test');const assert=require('node:assert/strict');const {leadingWagerTerms,normalizeSelection}=require('./wager-terms');const {gradePickFromEspn}=require('./espn-grading');
test('explicit original league labels and tightly bound publication wrappers normalize without changing wager',()=>{
 for(const [text,selection,league] of [['NBA 76ERS +5.5','76ERS +5.5','NBA'],['Early CBB Florida A&M +8.5 (-110) 1.5U','Florida A&M +8.5 (-110) 1.5U','NCAAB'],['(CFB) Ball State ML (2u)','Ball State ML (2u)','NCAAF'],['(CBB) Cal Poly vs Grand Canyon over 181.5 (2u)','Cal Poly vs Grand Canyon over 181.5 (2u)','NCAAB'],['2U CBB SOUTH FLORIDA -6.5 -115','SOUTH FLORIDA -6.5 -115','NCAAB'],['NCAAB Add Campbell +5 (-110) 1u','Campbell +5 (-110) 1u','NCAAB'],['CBB PLAY Valparaiso ML (-120) 1U.','Valparaiso ML (-120) 1U.','NCAAB']]) assert.deepEqual(leadingWagerTerms(text),{selection,league,conflictingLeagues:false});
});
test('conflicting labels, arbitrary hype, malformed parentheses and ambiguous NCAA are not erased',()=>{
 assert.equal(leadingWagerTerms('(NBA) CBB Rockets ML').conflictingLeagues,true);
 for(const text of ['Early Rockets ML','Add Campbell +5','NCAA Rockets ML','(NBA Rockets ML','NBA) Rockets ML']) assert.equal(leadingWagerTerms(text).selection,text);
});
test('sentence-ending punctuation on explicit moneyline price is not treated as decimal odds',()=>{
 assert.equal(normalizeSelection('Moneyline of the day - Pacers -130.'),'Pacers -130');
 assert.equal(normalizeSelection('Pacers -130.5'),'Pacers -130.5');
 assert.equal(normalizeSelection('Pacers -1.5.'),'Pacers -1.5.');
});
test('explicit league label scopes exact-name collision but unsupported unlabelled wager stays pending',async()=>{
 const make=(id,team)=>({id,status:{type:{completed:true}},competitions:[{competitors:[{team:{id:'1',displayName:team,shortDisplayName:'Rockets',name:'Rockets'},score:'110',winner:true},{team:{id:'2',displayName:'Opponent'},score:'100',winner:false}]}]});const nba=make('nba','Houston Rockets'),cfb=make('cfb','Toledo Rockets');
 const fetchImpl=async u=>{const event=u.includes('basketball/nba')?nba:u.includes('football/college-football')?cfb:null;return new Response(JSON.stringify(u.includes('/summary?')?{header:{competitions:[{...event.competitions[0],id:event.id,status:{type:{completed:true}}}]}}:{events:event?[event]:[]}));};
 assert.equal((await gradePickFromEspn({selection:'NBA Rockets ML',operating_date:'2026-11-11',result:'PENDING'},{fetchImpl})).result,'W');
 assert.equal((await gradePickFromEspn({selection:'Rockets ML',operating_date:'2026-11-11',result:'PENDING'},{fetchImpl})).status,'PENDING');
});
