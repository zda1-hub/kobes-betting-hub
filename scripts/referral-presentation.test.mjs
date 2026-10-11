import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../referral-production.js',import.meta.url),'utf8');
function render({hostname='kobesbettinghub.com',search='',hash=''}={}) {
  const nodes=new Map();
  for(const selector of ['[data-referral-login]','[data-referral-preview]','[data-referral-dashboard]','[data-referral-link]','[data-copy-referral]','[data-payout-setup]','[data-referral-message]','[data-referral-hero]','[data-referral-ready-heading]']) {
    nodes.set(selector,{hidden:selector.includes('dashboard')||selector.includes('preview'),attributes:{'aria-disabled':'true'},removeAttribute(k){delete this.attributes[k]},setAttribute(k,v){this.attributes[k]=v},focus(){this.focused=true},select(){this.selected=true},addEventListener(type,callback){this[type]=callback}});
  }
  let cleanUrl;const copied=[];
  vm.runInNewContext(source,{location:{protocol:'https:',hostname,pathname:'/refer',search,hash},window:{location:{hash,search},setTimeout(fn){fn()}},document:{querySelector:s=>nodes.get(s),execCommand(){}},history:{replaceState(a,b,url){cleanUrl=url}},navigator:{clipboard:{async writeText(value){copied.push(value)}}},URL,URLSearchParams});
  return {node:s=>nodes.get(s),cleanUrl,copied};
}
test('referral return shows a copyable personal link and preserves secure payout routing',async()=>{
  const r=render({hash:'#code=KBH-ABC1234567&auth=fixture-only'});
  assert.equal(r.node('[data-referral-hero]').hidden,true);
  assert.equal(r.node('[data-referral-dashboard]').hidden,false);
  assert.equal(r.node('[data-referral-ready-heading]').focused,true);
  assert.equal(r.node('[data-referral-link]').value,'https://kobesbettinghub.com/join.html?ref=KBH-ABC1234567');
  assert.equal(r.node('[data-payout-setup]').href,'https://kobes-betting-hub-checkout.kobedirwin.workers.dev/referrals/onboard?auth=fixture-only');
  assert.equal(r.cleanUrl,'/refer');
  await r.node('[data-copy-referral]').click();
  assert.deepEqual(r.copied,['https://kobesbettinghub.com/join.html?ref=KBH-ABC1234567']);
  assert.equal(r.node('[data-copy-referral]').textContent,'Copy my link');
});
test('local preview cannot activate referral login or payout setup',()=>{
  const r=render({hostname:'127.0.0.1',hash:'#code=KBH-ABC1234567&auth=fixture-only'});
  assert.equal(r.node('[data-referral-dashboard]').hidden,true);
  assert.equal(r.node('[data-referral-hero]').hidden,false);
  assert.equal(r.node('[data-referral-login]').href,undefined);
  assert.equal(r.node('[data-referral-login]').tabIndex,-1);
  assert.equal(r.node('[data-referral-preview]').hidden,false);
});
test('invalid codes keep onboarding visible and do not expose a personal link',()=>{
  const r=render({hash:'#code=invalid&auth=fixture-only'});
  assert.equal(r.node('[data-referral-dashboard]').hidden,true);
  assert.equal(r.node('[data-referral-hero]').hidden,false);
  assert.equal(r.node('[data-referral-link]').value,undefined);
});
test('Stripe refresh and complete returns retain their distinct actionable messages',()=>{
  const complete=render({search:'?code=KBH-ABC1234567&setup=complete'});
  assert.match(complete.node('[data-referral-message]').textContent,/Stripe may still need to verify/);
  assert.equal(complete.cleanUrl,'/refer?setup=complete&code=KBH-ABC1234567');
  assert.equal(complete.node('[data-payout-setup]').href,'https://kobes-betting-hub-checkout.kobedirwin.workers.dev/referrals/login');
  const refresh=render({search:'?code=KBH-ABC1234567&setup=refresh'});
  assert.match(refresh.node('[data-referral-message]').textContent,/expired.*Reconnect Discord/);
});
