const test = require('node:test');
const assert = require('node:assert/strict');
const { planFreePickResultEmails: plan } = require('./free-pick-result-emails');
const row = { pick_id:'pick-1', operating_date:'2026-10-15', status:'GRADED', published_at:'2026-10-15T18:00:00Z', post_reference:'https://discord.com/channels/1/2/3', selection:'Team ML', result:'L', score_or_outcome:'Lost 10–14', result_verified_source:'https://espn.com/game/1', result_verified_at:'2026-10-16T03:00:00Z' };
const delivery = { pickId:'pick-1', email:'one@example.com', status:'sent', sentAt:'2026-10-15T18:01:00Z', providerMessageId:'provider-1' };
const subscriber = { email:'one@example.com', subscribed:true, resultUpdatesConsent:true };
const run = (r=row,d=delivery,s=subscriber) => plan([r],[d],[s],'2');
test('includes losses and wins with stable deduplication keys', () => {
  const loss = run()[0]; assert.equal(loss.result,'L'); assert.match(loss.subject,/LOSS/);
  assert.equal(run({...row,result:'W'})[0].id,loss.id);
  assert.equal(plan([row],[delivery,delivery],[subscriber],'2').length,1);
  for (const result of ['W','L','P','V']) assert.equal(run({...row,result})[0].result,result);
});
test('requires verified settlement and actual receipt for exact pick', () => {
  assert.equal(run({...row,result_verified_source:''}).length,0);
  assert.equal(run(row,{...delivery,pickId:'different'}).length,0);
  assert.equal(run(row,{...delivery,status:'pending'}).length,0);
  assert.equal(run(row,{...delivery,providerMessageId:null}).length,0);
  assert.equal(run(row,{...delivery,sentAt:'2026-10-16T04:00:00Z'}).length,0);
});
test('requires current subscription and explicit result-update consent', () => {
  assert.equal(run(row,delivery,{...subscriber,subscribed:false}).length,0);
  assert.equal(run(row,delivery,{...subscriber,resultUpdatesConsent:false}).length,0);
  assert.equal(run(row,delivery,{email:subscriber.email,subscribed:true}).length,0);
});
