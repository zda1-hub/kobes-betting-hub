const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { injuryPages, injuryConfig, createInjuryDelivery } = require('./injury-reports');
const now = new Date('2026-09-17T23:00:00Z');
const data = () => ({ timestamp: now.toISOString(), injuries: [{ id: '1', displayName: 'A Team', injuries: [
  { athlete: { displayName: 'A Player', position: { abbreviation: 'WR' } }, status: 'Questionable', date: '2026-09-16T20:00Z', details: { type: 'Ankle' } }
] }] });
test('source facts retain status and old report dates without inferred availability', () => {
  const report = injuryPages('nfl', data(), now);
  assert.equal(report.count, 1);
  assert.match(report.pages[0].description, /A Player \(WR\).*Questionable.*Ankle.*2026-09-16/);
  assert.match(report.pages[0].description, /not confirmed game-day/);
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
