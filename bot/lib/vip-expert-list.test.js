const test = require('node:test');
const assert = require('node:assert/strict');
const { baselineNames, expertName, listMonth, managedNames, namesFromMessages, payloadFor } = require('./vip-expert-list');

test('reads Kobe’s original list and recognizes only actual expert-picks posts', () => {
  const list = { content: 'September 2026 Updated List - Alphabetical Order\n- Ben Burns ($150/week)\n- McBets ($39.99/week)\n- LearLocks ($10/3 days)\nTotal: 3 cappers/sources.' };
  assert.deepEqual(baselineNames(list), ['Ben Burns', 'McBets', 'LearLocks']);
  assert.equal(listMonth(list), 'September 2026');
  assert.equal(expertName({ content: 'Hammering Hank 5u max\n• Falcons +2.5' }), 'Hammering Hank');
  assert.equal(expertName({ content: 'Kyren Williams Over 50.5 yards' }), '');
  const names = namesFromMessages([
    { content: 'MC BETS\n• Broncos ML' },
    { content: 'Kelly In Vegas\n• Rams -6.5' },
    { content: 'Hammering Hank 5u max\n• Falcons +2.5' }
  ], baselineNames(list));
  assert.deepEqual(names, ['Ben Burns', 'Hammering Hank', 'Kelly In Vegas', 'LearLocks', 'McBets']);
  const payload = payloadFor(names);
  assert.equal(payload.embeds[0].title, 'Current list of experts: 5');
  assert.deepEqual(managedNames({ embeds: payload.embeds }), names);
  assert.equal(payload.content, '');
  assert.equal(payload.embeds[0].footer.text, 'KBH vip-expert-list-v1');
  assert.doesNotMatch(JSON.stringify(payload), /Falcons|Broncos|Rams|\$150/);
});

const { previousDayRecords, previousMstDate } = require('./vip-expert-list');
test('previous MST date does not switch days at Pacific DST midnight', () => {
  assert.equal(previousMstDate(new Date('2026-10-13T07:30:00Z')), '2026-10-12');
  assert.equal(previousMstDate(new Date('2026-10-13T06:30:00Z')), '2026-10-11');
  assert.equal(previousMstDate(new Date('2026-01-02T07:30:00Z')), '2026-01-01');
});
test('verified yesterday records deduplicate reposts and hold conflicts and unverified groups', () => {
  const base = { operating_date: '2026-10-12', source_name: 'Alpha', published_at: '2026-10-12T20:00:00Z', post_reference: 'https://discord.com/channels/1/2/3', status: 'GRADED', result_verified_source: 'verified', wager_scope: 'individual' };
  const rows = [
    { ...base, pick_id: 'a', selection: 'Team ML', result: 'W' },
    { ...base, pick_id: 'b', selection: 'Team ML', result: 'W' },
    { ...base, pick_id: 'c', selection: 'Other ML', result: 'L' },
    { ...base, pick_id: 'd', selection: 'Conflict ML', result: 'W' },
    { ...base, pick_id: 'e', selection: 'Conflict ML', result: 'L' },
    { ...base, pick_id: 'tg-20261012-1-1', selection: 'Group', result: 'W', wager_scope: '' },
    { ...base, pick_id: 'f', selection: 'Unverified', result: 'W', result_verified_source: '' },
    { ...base, pick_id: 'g', selection: 'Not published', result: 'W', published_at: '' },
    { ...base, pick_id: 'h', selection: 'Today', result: 'W', operating_date: '2026-10-13' }
  ];
  const records = previousDayRecords(rows, '2026-10-12');
  assert.deepEqual(records.get('alpha'), { W: 1, L: 1, P: 0, V: 0, PENDING: 3 });
  const payload = payloadFor(['Zulu', 'Alpha'], { date: '2026-10-12', records });
  assert.match(payload.embeds[0].description, /01\. Alpha.*1-1 \(3 pending\)/);
  assert.match(payload.embeds[0].description, /02\. Zulu.*no verified results/);
  assert.deepEqual(managedNames({ embeds: payload.embeds }), ['Alpha', 'Zulu']);
});

const { payloadsFor, createVipExpertList } = require('./vip-expert-list');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
test('all 366 experts and no-result annotations fit per-message Discord limits without truncation', () => {
  const names=Array.from({length:366},(_,index)=>`Expert Source ${String(index).padStart(3,'0')} Long Name`);
  const payloads=payloadsFor(names,{date:'2026-10-13'});
  assert.ok(payloads.length>1);
  for (const payload of payloads) {
    assert.ok(payload.embeds.length<=10);
    const characters=payload.embeds.reduce((sum,embed)=>sum+embed.title.length+embed.description.length+embed.footer.text.length+50,0);
    assert.ok(characters<=6000,`aggregate Discord message size ${characters}`);
    assert.ok(payload.embeds[0].description.length<=4096);
  }
  assert.deepEqual(payloads.flatMap(payload=>managedNames({embeds:payload.embeds})),names);
  assert.throws(()=>payloadFor(names,{date:'2026-10-13'}),/multiple messages/);
});
test('multi-message list checkpoints and reconciles lost send receipts without duplicate parts', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-list-'));
  try {
    const names=Array.from({length:366},(_,index)=>`Expert Source ${String(index).padStart(3,'0')}`);
    const original={id:'original',content:'Updated List\n'+names.map(name=>'- '+name).join('\n')};
    const messages=new Map([['original',original]]);let sends=0,lose=true;
    const destination={messages:{fetch:async query=>typeof query==='string'?(messages.get(query)||Promise.reject(new Error('missing'))):messages},send:async payload=>{
      sends++;const message={id:String(sends),embeds:payload.embeds,edit:async next=>{message.embeds=next.embeds;return message}};messages.set(message.id,message);
      if(lose){lose=false;throw new Error('lost response')}return message;
    }};
    const source={id:'expert',messages:{fetch:async()=>new Map()}};
    const engine=createVipExpertList({sourceChannelFor:async()=>source,listChannelFor:async()=>destination,stateFile:path.join(root,'state.json'),readRows:async()=>[],previousDate:()=> '2026-10-13'});
    await assert.rejects(engine.refresh(),/lost response/);
    const result=await engine.refresh();assert.equal(result.messageIds.length,payloadsFor(names,{date:'2026-10-13'}).length);
    assert.equal(sends,result.messageIds.length);
    assert.equal((await engine.refresh()).status,'UNCHANGED');assert.equal(sends,result.messageIds.length);
    assert.deepEqual(result.messageIds.flatMap(id=>managedNames(messages.get(id))),names);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('explicit Discord permission rejection clears only the unsent reservation for safe retry', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-list-permission-'));
  try {
    const names=Array.from({length:30},(_,index)=>`Expert Source ${index}`);
    const original={id:'original',content:'Updated List\n'+names.map(name=>'- '+name).join('\n')};
    const stateFile=path.join(root,'state.json');let attempts=0;
    const destination={id:'list-channel',messages:{fetch:async()=>new Map([['original',original]])},send:async()=>{attempts++;throw Object.assign(new Error('Missing Permissions'),{code:50013,status:403})}};
    const source={id:'expert',messages:{fetch:async()=>new Map()}};
    const engine=createVipExpertList({sourceChannelFor:async()=>source,listChannelFor:async()=>destination,stateFile});
    await assert.rejects(engine.refresh(),/part 1\/1.*list-channel.*Send Messages/);
    assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).pending_part,undefined);
    await assert.rejects(engine.refresh(),/Send Messages/);
    assert.equal(attempts,2);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('one known rejected rollout reservation recovers but every other missing receipt stays held', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'expert-list-migration-'));
  try {
    for(const marker of ['part:fe0d656c757a98f16f8e:1','part:unknown:1']) {
      const names=Array.from({length:30},(_,index)=>`Expert Source ${index}`);
      const original={id:'original',content:'Updated List\n'+names.map(name=>'- '+name).join('\n')};
      const stateFile=path.join(root,marker.includes('unknown')?'unknown.json':'known.json');
      await fs.writeFile(stateFile,JSON.stringify({pending_part:{index:1,marker}}));let sends=0;
      const destination={id:'list',messages:{fetch:async()=>new Map([['original',original]])},send:async()=>{sends++;throw Object.assign(new Error('Missing Permissions'),{code:50013,status:403})}};
      const engine=createVipExpertList({sourceChannelFor:async()=>({id:'expert',messages:{fetch:async()=>new Map()}}),listChannelFor:async()=>destination,stateFile});
      if(marker.includes('unknown')) {await assert.rejects(engine.refresh(),/uncertain/);assert.equal(sends,0);assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).pending_part.marker,marker);}
      else {await assert.rejects(engine.refresh(),/Send Messages/);assert.equal(sends,1);assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).pending_part,undefined);}
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
