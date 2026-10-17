import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const api = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).__test;
const event = (id,type,at='2026-10-17T23:00:00Z') => ({id:crypto.randomUUID(),stripe_subscription_id:id,event_type:type,occurred_at:at,actor_type:'discord_admin'});
const env = {SUPABASE_URL:'https://database.test',SUPABASE_SECRET_KEY:'test'};
const request = body => new Request('https://worker.test/admin/discord-setup-alert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('latest explicit admin choice applies only to the exact subscription and is reversible',()=>{
 const ignored = api.discordSetupAlertExceptions([
  event('sub_old','DISCORD_SETUP_ALERT_IGNORED'),
  event('sub_restore','DISCORD_SETUP_ALERT_RESTORED','2026-10-17T23:01:00Z'),
  event('sub_restore','DISCORD_SETUP_ALERT_IGNORED'),
  {...event('sub_bot','DISCORD_SETUP_ALERT_IGNORED'),actor_type:'system'},
  event('sub_old','UNRELATED_EVENT','2026-10-17T23:02:00Z'),
 ]);
 assert.deepEqual([...ignored],['sub_old']);
 assert.equal(ignored.has('sub_new'),false);
});

test('an unauthenticated or malformed reminder mutation fails before any persistence call',async()=>{
 assert.equal((await api.adminDiscordSetupAlert(request({subscriptionId:'sub_one',ignored:true}),env,null,async()=>null)).status,401);
 assert.equal((await api.adminDiscordSetupAlert(request({subscriptionId:'sub_one',ignored:'true'}),env,null,async()=>({discordUserId:'admin'}))).status,400);
});

test('ignore and restore append audit events only; no Stripe, billing or Discord mutation',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);calls.push({url,options});
  if(url.includes('membership_subscriptions?'))return Response.json([{stripe_subscription_id:'sub_one',stripe_customer_id:'cus_one',status:'active',entitlement_blocked:false}]);
  if(url.includes('membership_customers?'))return Response.json([{discord_user_id:null}]);
  if(url.endsWith('/membership_events'))return new Response(null,{status:204});
  throw new Error('Unexpected external call');
 };
 try{
  for(const ignored of [true,false]){
   const response=await api.adminDiscordSetupAlert(request({subscriptionId:'sub_one',ignored}),env,null,async()=>({discordUserId:'1234567890'}));
   assert.equal(response.status,200);
  }
  const writes=calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,2);
  assert.deepEqual(writes.map(c=>JSON.parse(c.options.body).event_type),['DISCORD_SETUP_ALERT_IGNORED','DISCORD_SETUP_ALERT_RESTORED']);
  assert.ok(writes.every(c=>JSON.parse(c.options.body).details.notificationOnly));
  assert.ok(calls.every(c=>c.url.startsWith('https://database.test/rest/v1/')));
 }finally{globalThis.fetch=original}
});

test('new exceptions cannot hide a linked account, canceled account or blocked entitlement',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [status,blocked,linked] of [['active',false,true],['canceled',false,false],['active',true,false]]){
   const writes=[];
   globalThis.fetch=async(input,options={})=>{
    if(options.method==='POST')writes.push(input);
    return Response.json(String(input).includes('membership_subscriptions?')?[{stripe_subscription_id:'sub_one',stripe_customer_id:'cus_one',status,entitlement_blocked:blocked}]:[{discord_user_id:linked?'1234567890':null}]);
   };
   const response=await api.adminDiscordSetupAlert(request({subscriptionId:'sub_one',ignored:true}),env,null,async()=>({discordUserId:'admin'}));
   assert.equal(response.status,409);assert.equal(writes.length,0);
  }
 }finally{globalThis.fetch=original}
});

test('ignored legacy setup never hides linked role failures or unavailable checks',()=>{
 const checks=[
  {role:'MISSING_DISCORD',subscription:{stripe_subscription_id:'sub_legacy'}},
  {role:'MISSING_DISCORD',subscription:{stripe_subscription_id:'sub_new'}},
  {role:'MISSING',subscription:{stripe_subscription_id:'sub_legacy'}},
  {role:'CHECK_FAILED',subscription:{stripe_subscription_id:'sub_legacy'}},
 ];
 const result=api.partitionVipRoleChecks(checks,new Set(['sub_legacy']));
 assert.deepEqual(result.confirmedMissing.map(x=>x.subscription.stripe_subscription_id),['sub_new','sub_legacy']);
 assert.equal(result.ignoredSetup.length,1);assert.equal(result.unavailable.length,1);
});
