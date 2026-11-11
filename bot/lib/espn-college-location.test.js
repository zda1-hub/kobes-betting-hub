const test = require('node:test');
const assert = require('node:assert/strict');
const { gradePickFromEspn } = require('./espn-grading');
const event = { id: '401906771', status: { type: { completed: true } }, competitions: [{ competitors: [
 {team:{id:'52',location:'Florida State',name:'Seminoles',shortDisplayName:'Florida St',displayName:'Florida State Seminoles',abbreviation:'FSU'},score:'72'},
 {team:{id:'57',location:'Florida',name:'Gators',shortDisplayName:'Florida',displayName:'Florida Gators',abbreviation:'FLA'},score:'81'}
]}] };
const summary = {header:{competitions:[{id:event.id,status:{type:{completed:true}},competitors:event.competitions[0].competitors}]}};
const row = {pick_id:'20261110-119-X-W001',operating_date:'2026-11-10',selection:'Florida State +9.5 -110 1u',league:'NCAAB',result:'PENDING'};
function fetcher(events=[event]) { return async url => new Response(JSON.stringify(url.includes('/summary?') ? summary : {events})); }
test('exact ESPN college location resolves Florida State spread without guessing shortened aliases', async()=>{
 const result = await gradePickFromEspn(row,{fetchImpl:fetcher()});
 assert.equal(result.result,'W'); assert.equal(result.source,'https://www.espn.com/mens-college-basketball/game/_/gameId/401906771');
});
test('both original Florida matchup names resolve exact full-game under', async()=>{
 for(const selection of ['Florida vs Florida State u165.5 (3u)','FLORIDA/FLORIDA STATE UNDER 165.5 (-110) (3-UNITS)']) {
 const result = await gradePickFromEspn({...row,selection},{fetchImpl:fetcher()});
 assert.equal(result.result,'W'); assert.match(result.outcome,/153/);
 }
});
test('duplicate exact college locations remain pending rather than picking first',async()=>{
 const duplicate = structuredClone(event); duplicate.id='second-game';
 assert.equal((await gradePickFromEspn(row,{fetchImpl:fetcher([event,duplicate])})).status,'PENDING');
});
test('partial or arbitrary college names are not broadened into exact location matches',async()=>{
 assert.equal((await gradePickFromEspn({...row,selection:'Florida Sta +9.5'},{fetchImpl:fetcher()})).status,'PENDING');
});
test('college basketball explicitly requests all Division I games, not default ranked-only slate',async()=>{
 const urls=[];
 const fetchImpl = async url => {urls.push(url); return url.includes('/scoreboard?') && new URL(url).searchParams.get('groups') !== '50' ? new Response(JSON.stringify({events:[]})) : fetcher()(url);};
 assert.equal((await gradePickFromEspn(row,{fetchImpl})).result,'W');
 assert.ok(urls.filter(u=>u.includes('/scoreboard?')).every(u=>new URL(u).searchParams.get('groups')==='50' && new URL(u).searchParams.get('limit')==='1000'));
});
