const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {telegramPacket,createTelegramReader}=require('./telegram-reader');
const {telegramConfig,encryptSession,decryptSession,saveTelegramSession,loadTelegramSession}=require('./telegram-session');
const now=new Date('2026-09-17T23:00:00Z'),channelId='3593544389',apiHash='a'.repeat(32);
const message=(id=1,text='AnalyticsCapper\nAngels ML -110 (10U)')=>({id,date:now.getTime()/1000-60,peerId:{channelId},message:text});
test('Telegram packet accepts only selected current-day channel, rejects old results and advertisements',()=>{
  assert.equal(telegramPacket(message(),channelId,now).source.platform,'Telegram');
  assert.throws(()=>telegramPacket({...message(),peerId:{channelId:'other'}},channelId,now));
  assert.equal(telegramPacket({...message(),date:now.getTime()/1000-86400},channelId,now),null);
  assert.equal(telegramPacket(message(1,'Yesterday results Angels ML -110'),channelId,now),null);
});
test('encrypted session round-trip hides secret and rejects wrong key/tampering',()=>{
  const value=encryptSession('private-account-session',apiHash);
  assert.equal(decryptSession(value,apiHash),'private-account-session');
  assert.ok(!JSON.stringify(value).includes('private-account-session'));
  assert.throws(()=>decryptSession(value,'b'.repeat(32)));
  assert.throws(()=>decryptSession({...value,data:Buffer.from('tampered').toString('base64')},apiHash));
});
test('Render refuses ephemeral Telegram storage and malformed credentials',()=>{
  assert.throws(()=>telegramConfig({TELEGRAM_API_ID:'1',TELEGRAM_API_HASH:apiHash,RENDER:'true',TELEGRAM_DATA_ROOT:'/tmp/session'}));
  assert.throws(()=>telegramConfig({TELEGRAM_API_ID:'1',TELEGRAM_API_HASH:'invalid'}));
});
async function harness(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kbh-telegram-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const config={root,apiId:1,apiHash,sessionFile:path.join(root,'session.enc.json'),channelId};
  await saveTelegramSession(config,'session');await fs.writeFile(path.join(root,'channel-peer.json'),JSON.stringify({channelId,accessHash:'123'}));
  const messages=[message()],sent=[],receipts=[],auditEvents=[];
  const channel={id:'1539135477355905094',client:{user:{id:'bot'}},send:async payload=>{sent.push(payload);return{id:'receipt'}},messages:{fetch:async()=>new Map(receipts.map(m=>[m.id,m]))}};
  const telegram={connected:true,connect:async()=>{},disconnect:async()=>{},checkAuthorization:async()=>true,
    getEntity:async()=>({id:channelId,broadcast:true}),getMessages:async(_,params)=>messages.filter(m=>m.id>(params.minId||0)),downloadMedia:async()=>Buffer.from('image')};
  const audit=Object.fromEntries(['recordSourcePost','upsertPickCandidate','recordApprovalCard','recordWorkflowEvent'].map(k=>[k,async()=>auditEvents.push(k)]));
  const options={config,queueRoot:path.join(root,'queue'),channelFor:async()=>channel,clientFactory:async()=>telegram,now:()=>now,audit,logger:{error(){}}};
  return{root,config,messages,sent,receipts,auditEvents,channel,telegram,options};
}
test('session file requires private permissions',async t=>{
  const h=await harness(t);assert.equal(await loadTelegramSession(h.config),'session');
  await fs.chmod(h.config.sessionFile,0o644);await assert.rejects(()=>loadTelegramSession(h.config));
});
test('lossless Telegram terms go only to private grouped approvals and restart does not repeat',async t=>{
  const h=await harness(t);await createTelegramReader(h.options).run();await createTelegramReader(h.options).run();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].embeds[0].description,'AnalyticsCapper\n• Angels ML -110 (10U)');
  assert.deepEqual(h.sent[0].components[0].components.map(button=>button.label),['Post to #expert-picks','Reject']);assert.equal(h.sent[0].enforceNonce,true);
  const packet=JSON.parse(await fs.readFile(path.join(h.root,'queue','2026-09-17', 'tg-20260917-3593544389-1.json'),'utf8'));
  assert.equal(typeof packet.approval.exact_final_copy,'string');
});
test('same capper terms reposted under another message ID are not duplicated',async t=>{
  const h=await harness(t);h.messages.push(message(2));await createTelegramReader(h.options).run();assert.equal(h.sent.length,1);
});
test('uncertain Telegram-to-Discord send is held instead of blindly replayed',async t=>{
  const h=await harness(t);h.channel.send=async payload=>{h.sent.push(payload);throw Error('lost')};
  await createTelegramReader(h.options).run();await createTelegramReader(h.options).run();assert.equal(h.sent.length,1);
});
test('uncertain delivery recovers matching native button receipt',async t=>{
  const h=await harness(t);h.channel.send=async payload=>{h.sent.push(payload);h.receipts.push({id:'found',author:{id:'bot'},components:payload.components});throw Error('lost')};
  await createTelegramReader(h.options).run();await createTelegramReader(h.options).run();assert.equal(h.sent.length,1);assert.ok(h.auditEvents.includes('recordApprovalCard'));
});
test('unknown capper or missing market is held, not published as slop',async t=>{
  const h=await harness(t);h.messages[0]=message(1,'Some text with Over 44');
  h.options.enrich=async()=>({status:'SOURCE_EXTRACTED',extraction:{is_pick_candidate:true,selection:'Over 44',source_capper_name:'',plays:[]}});
  await createTelegramReader(h.options).run();assert.equal(h.sent.length,0);
});
test('missing session reports awaiting login without a Telegram connection',async t=>{
  const h=await harness(t);await fs.rename(h.config.sessionFile,`${h.config.sessionFile}.held`);
  const result=await createTelegramReader(h.options).run();assert.equal(result[0].status,'AWAITING_LOGIN');assert.equal(h.sent.length,0);
});
test('an unextractable message retries across restarts, is preserved, and cannot block later picks forever',async t=>{
  const h=await harness(t);h.messages[0]={...message(1,''),photo:{}};
  h.messages.push(message(2));
  h.options.enrich=async()=>({status:'EXTRACTION_FAILED',detail:'private-provider-detail'});
  assert.equal((await createTelegramReader(h.options).run())[0].status,'DEFERRED_EXTRACTION');
  assert.equal((await createTelegramReader(h.options).run())[0].status,'DEFERRED_EXTRACTION');
  const third=await createTelegramReader(h.options).run();
  assert.equal(third[0].status,'HELD_EXTRACTION_FAILED');
  assert.equal(third[1].status,'PRIVATE_APPROVAL_DELIVERED');
  assert.equal(h.sent.length,1);
  const held=JSON.parse(await fs.readFile(path.join(h.root,'queue','2026-09-17','tg-20260917-3593544389-1.json'),'utf8'));
  assert.equal(held.status,'HELD_EXTRACTION_FAILED');
  assert.ok(!JSON.stringify(held).includes('private-provider-detail'));
  await createTelegramReader(h.options).run();assert.equal(h.sent.length,1);
});
test('configuration and budget deferrals are not mistaken for bad source content',async t=>{
  const h=await harness(t);h.messages[0]={...message(1,''),photo:{}};
  h.options.enrich=async()=>({status:'BUDGET_EXCEEDED'});
  for(let i=0;i<4;i++)assert.equal((await createTelegramReader(h.options).run())[0].extractionStatus,'BUDGET_EXCEEDED');
  h.options.enrich=async()=>({status:'SOURCE_EXTRACTED',extraction:{lossless_text_terms:true,is_pick_candidate:true,
    source_capper_name:'AnalyticsCapper',selection:'Angels ML -110',plays:[{selection:'Angels ML -110'}],missing_or_ambiguous:[]}});
  await createTelegramReader(h.options).run();
  assert.equal(h.sent.length,1);
});
test('configured model-call cap can match the X collector without losing the next message',async t=>{
  const h=await harness(t);
  h.messages.splice(0,1,
    {...message(1,''),photo:{}}, {...message(2,''),photo:{}}, {...message(3,''),photo:{}});
  h.options.maxModelCalls=2;
  h.options.enrich=async (packet,{beforeOpenAIRequest})=>{
    assert.equal(beforeOpenAIRequest(),true);
    return {status:'SOURCE_EXTRACTED',extraction:{lossless_text_terms:true,is_pick_candidate:true,
      source_capper_name:`Capper ${packet.source.post_id}`,selection:'Angels ML -110',
      plays:[{selection:'Angels ML -110'}],missing_or_ambiguous:[]}};
  };
  const first=await createTelegramReader(h.options).run();
  assert.equal(first.at(-1).status,'DEFERRED_MODEL_CAP');
  assert.equal(h.sent.length,2);
  await createTelegramReader(h.options).run();
  assert.equal(h.sent.length,3);
});
test('downloads the default largest photo and never sends empty bytes for extraction',async t=>{
  const h=await harness(t);h.messages[0]={...message(1,''),photo:{}};let models=0;
  h.telegram.downloadMedia=async(...args)=>{assert.equal(args.length,1);return Buffer.alloc(0);};
  h.options.enrich=async()=>{models++;return{status:'EXTRACTION_FAILED'};};
  assert.equal((await createTelegramReader(h.options).run())[0].status,'NEEDS_ATTENTION');
  assert.equal(models,0);assert.equal(h.sent.length,0);
});
test('recovers a never-delivered legacy photo hold behind the cursor without replaying delivered cards',async t=>{
  const h=await harness(t);h.messages[0]={...message(1,''),photo:{}};h.messages.push(message(3));
  h.telegram.getMessages=async(_,params)=>h.messages.filter(m=>params.ids?params.ids.includes(m.id):m.id>(params.minId||0));
  await fs.writeFile(path.join(h.root,'reader-state.json'),JSON.stringify({channelId,cursor:3,
    records:{'1':{status:'HELD_EXTRACTION_FAILED'},'3':{status:'DELIVERED',messageId:'already'}},extractionRetries:{'1':3}}));
  h.options.enrich=async()=>({status:'SOURCE_EXTRACTED',extraction:require('../../pipeline/exclusive-text').exclusiveTextExtraction({publish_mode:'terms_only'},'AnalyticsCapper\nAngels ML -110 (10U)')});
  const result=await createTelegramReader(h.options).run();
  assert.equal(result[0].status,'PRIVATE_APPROVAL_DELIVERED');assert.equal(h.sent.length,1);
  await createTelegramReader(h.options).run();assert.equal(h.sent.length,1);
});
test('initial catch-up pages past 100 messages without losing older current-day picks',async t=>{
  const h=await harness(t);const offsets=[];
  h.telegram.getMessages=async(_,params)=>{
    offsets.push(params.offsetId||0);
    if(!params.offsetId)return Array.from({length:100},(_,i)=>message(200-i,'ordinary discussion'));
    return [message(100),{...message(99),date:now.getTime()/1000-86400}];
  };
  await createTelegramReader(h.options).run();assert.deepEqual(offsets,[0,101]);assert.equal(h.sent.length,1);
});
