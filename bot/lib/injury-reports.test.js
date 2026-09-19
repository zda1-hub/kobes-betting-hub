const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { injuryPages, injuryConfig, createInjuryDelivery, injuryCategory } = require('./injury-reports');
const now = new Date('2026-09-17T23:00:00Z');
const data = () => ({ timestamp: now.toISOString(), injuries: [{ id: '1', displayName: 'A Team', injuries: [
  { athlete: { displayName: 'A Player', position: { abbreviation: 'WR' } }, status: 'Questionable', date: '2026-09-16T20:00Z', details: { type: 'Ankle' } }
] }] });
test('source facts retain status and old report dates without inferred availability', () => {
  const report = injuryPages('nfl', data(), now);
  assert.equal(report.count, 1);
  assert.match(report.pages[0].description, /\*\*A Team\*\*[\s\S]*🟡 \*A Player\* \(WR\) — \*\*Questionable\*\*[\s\S]*Ankle.*2026-09-16/);
  assert.match(report.pages[0].description, /not confirmed game-day/);
});
test('active/probable players are omitted and unavailable players have names/statuses only', () => {
  const input=data();
  input.injuries[0].injuries.push(
    {athlete:{displayName:'Active Person'},status:'Active'},
    {athlete:{displayName:'Probable Person'},status:'Probable'},
    {athlete:{displayName:'Out Person'},status:'Out',date:'2026-09-01',details:{type:'Shoulder'},shortComment:'Do not copy this'},
    {athlete:{displayName:'Reserve Person'},status:'Injured Reserve',details:{type:'Elbow'}}
  );
  const report=injuryPages('nfl',input,now), text=report.pages.map(x=>x.description).join('\n');
  assert.equal(report.count,3);assert.equal(report.uncertainCount,1);assert.equal(report.unavailableCount,2);
  assert.doesNotMatch(text,/Active Person|Probable Person|Shoulder|Elbow|Do not copy this|2026-09-01/);
  assert.match(text,/🔴 \*\*Out \/ unavailable\*\*[\s\S]*\*Out Person\* \(Out\) · \*Reserve Person\* \(Injured Reserve\)/);
});
test('uncertain summaries are brief source facts, not unrelated comments or projected return dates',()=>{
  const input=data();Object.assign(input.injuries[0].injuries[0],{shortComment:'Credited with a win, five strikeouts',details:{type:'Ankle',returnDate:'2026-09-20'}});
  const text=injuryPages('nfl',input,now).pages[0].description;
  assert.match(text,/🟡[\s\S]*Ankle issue; availability unconfirmed\. Report: 2026-09-16\./);
  assert.doesNotMatch(text,/strikeouts|2026-09-20|game.time decision|will play/i);
});
test('doubtful/day-to-day stay uncertain, while IL/suspension remain unavailable',()=>{
  for(const status of ['Questionable','Doubtful','Day-To-Day'])assert.equal(injuryCategory(status),'uncertain');
  for(const status of ['Out','Inactive','Injured Reserve','60-Day-IL','15-Day-IL','10-Day-IL','7-Day IL','Suspension'])assert.equal(injuryCategory(status),'unavailable');
  for(const status of ['Active','Probable','Unknown','Healthy'])assert.equal(injuryCategory(status),null);
  const input=data();input.injuries[0].injuries[0].status='Doubtful';
  assert.match(injuryPages('nfl',input,now).pages[0].description,/🟠[^\n]+Doubtful/);
});
test('an empty filtered list does not claim healthy rosters',()=>{
  const input=data();input.injuries[0].injuries[0].status='Active';
  const report=injuryPages('nfl',input,now);
  assert.equal(report.count,0);assert.equal(report.pages.length,1);
  assert.match(report.pages[0].description,/does not confirm that every player is healthy/);
});
test('stale, undated and incomplete injury feeds fail closed', () => {
  for (const invalid of [{...data(), timestamp:'2026-09-10T00:00Z'}, {...data(),timestamp:null}, {...data(), injuries:[{injuries:[{status:'Out'}]}]}]) {
    assert.throws(() => injuryPages('nfl', invalid, now));
  }
});
test('large lists keep every distinct athlete and fit Discord embed limits', () => {
  const input = data(); input.injuries[0].injuries = Array.from({length:800},(_,i)=>({...data().injuries[0].injuries[0],athlete:{displayName:`Full Player ${i}`}}));
  const report = injuryPages('nfl', input, now);
  assert.equal(report.count,800); assert.ok(report.pages.length > 10);
  assert.ok(report.pages.every(page => page.description.length < 4096));
  assert.ok(report.pages.at(-1).description.includes('Full Player 799'));
});
test('config rejects unsupported or duplicate league routes', () => {
  assert.throws(()=>injuryConfig({INJURY_CHANNEL_MAP:'fake:1539061878062583848'}));
  assert.throws(()=>injuryConfig({INJURY_CHANNEL_MAP:'nfl:1539061878062583848,nfl:1539061878062583848'}));
});
async function harness(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'kbh-injury-test-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const input = data(), sent = [], edits = [], messages = [];
  const channel = {client:{user:{id:'bot'}}, send:async payload=>{sent.push(payload);return{id:'1'}},
    messages:{edit:async(id,payload)=>{edits.push(payload);return{id}},fetch:async()=>new Map(messages.map(m=>[m.id,m]))}};
  const options = {root,routes:[{league:'nfl',channelId:'1539061878062583848'}],channelFor:async()=>channel,
    fetchImpl:async()=>({ok:true,json:async()=>input}),now:()=>now,logger:{error(){}}};
  return {root,input,sent,edits,messages,channel,options};
}
test('restart and unchanged refresh do not duplicate the daily board; changes edit', async t => {
  const h=await harness(t); await createInjuryDelivery(h.options).run(); await createInjuryDelivery(h.options).run();
  assert.equal(h.sent.length,1); assert.equal(h.edits.length,0);
  h.input.injuries[0].injuries[0].status='Out'; await createInjuryDelivery(h.options).run();
  assert.equal(h.sent.length,1); assert.equal(h.edits.length,1);
  assert.equal(h.sent[0].enforceNonce,true);
});
test('ambiguous sends are held, not replayed on restart', async t => {
  const h=await harness(t); h.channel.send=async()=>{h.sent.push({});throw Error('lost response')};
  await createInjuryDelivery(h.options).run(); await createInjuryDelivery(h.options).run(); assert.equal(h.sent.length,1);
});
test('ambiguous send recovers from exactly one matching bot receipt', async t => {
  const h=await harness(t); h.channel.send=async payload=>{h.sent.push(payload);h.messages.push({id:'found',author:{id:'bot'},embeds:payload.embeds});throw Error('lost response')};
  await createInjuryDelivery(h.options).run(); await createInjuryDelivery(h.options).run();
  assert.equal(h.sent.length,1); assert.equal(h.edits.length,1);
});
test('source failure never sends a healthy/no-injury assertion', async t => {
  const h=await harness(t); h.options.fetchImpl=async()=>({ok:false}); const result=await createInjuryDelivery(h.options).run();
  assert.equal(h.sent.length,0); assert.equal(result[0].status,'NEEDS_ATTENTION');
});
test('missing channel permission is blocked before any delivery reservation',async t=>{
  const h=await harness(t);h.channel.permissionsFor=()=>({has:()=>false});
  await createInjuryDelivery(h.options).run();assert.equal(h.sent.length,0);
  assert.equal((await fs.readdir(h.root)).length,0);
});
test('definite Discord rejection retains evidence and safely retries after repair',async t=>{
  const h=await harness(t);const send=h.channel.send;
  h.channel.send=async()=>{throw Object.assign(Error('Rejected'),{status:403})};
  await createInjuryDelivery(h.options).run();
  const state=JSON.parse(await fs.readFile(path.join(h.root,'2026-09-17-nfl.json'),'utf8'));
  assert.equal(state.pages[0].rejectedHttpStatus,403);assert.equal(state.pages[0].reserved,false);
  h.channel.send=send;await createInjuryDelivery(h.options).run();assert.equal(h.sent.length,1);
});
