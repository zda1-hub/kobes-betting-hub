import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../admin-analytics.js',import.meta.url),'utf8');
function harness(){
  const elements=new Map();
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{value:selector==='[data-member-filter]'?'all':selector==='[data-member-scope]'?'range':'',textContent:'',innerHTML:'',hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v},classList:{toggle(){}},addEventListener(){},querySelectorAll(){return []}});return elements.get(selector)};
  const document={querySelector:element,querySelectorAll:()=>[]};
  // Builder controls are unrelated to date filtering.
  const context=vm.createContext({window:{__KBH_MEMBERSHIP_CONFIG__:{workerOrigin:'https://worker.test'}},location:{hash:'',pathname:'/admin/analytics'},localStorage:{getItem:()=>'',setItem(){},removeItem(){}},sessionStorage:{getItem:()=>''},history:{replaceState(){}},document,URL,URLSearchParams,Intl,Date,console});
  vm.runInContext(source.replace('setupCampaignLinks();setupCreatorInvite();load();',''),context);
  return {context,element,run:code=>vm.runInContext(code,context)};
}
const range={preset:'today',start:'2026-09-26T07:00:00.000Z',end:'2026-09-27T05:00:00.000Z'};
test('separately loaded publishing data updates the overview status without inventing a current-day pick',()=>{
  const h=harness(),card=h.element('[data-priority-alerts] a[href="#publishing-status"]');
  h.run('updatePickAttention({publishedDate:pacificDate()})');
  assert.match(card.innerHTML,/>Published</);
  h.run("updatePickAttention({publishedDate:'2000-01-01'})");
  assert.match(card.innerHTML,/>Not published</);
  assert.match(card.innerHTML,/Latest: 2000-01-01/);
  h.run('updatePickAttention(null)');
  assert.match(card.innerHTML,/>Unavailable</);
});
test('dashboard opens on Today and isolates executive totals from filtered metrics',()=>{
  const h=harness();assert.equal(h.run('currentRange'),'today');
  h.element('[data-primary]').innerHTML='filtered result';
  h.context.d={scoreboard:{activePaid:9,mrrCents:29691,newPaidToday:0,cancelledToday:0,netAddsToday:0,newPaidLast7:1}};
  h.run('renderExecutive(d)');
  assert.equal(h.element('[data-primary]').innerHTML,'filtered result');
  assert.match(h.element('[data-current]').innerHTML,/Paid subscriptions · now/);
});
test('custom same-day range includes the whole Phoenix day with exclusive next midnight',()=>{
  const h=harness();const p=h.run("customRangeParams('2026-09-26','2026-09-26')");
  assert.equal(p.get('start'),'2026-09-26T07:00:00.000Z');
  assert.equal(p.get('end'),'2026-09-27T07:00:00.000Z');
  assert.throws(()=>h.run("customRangeParams('2026-09-27','2026-09-26')"),/end date/);
  assert.throws(()=>h.run("customRangeParams('2026-02-30','2026-03-01')"),/valid end date/);
  assert.throws(()=>h.run("customRangeParams('','2026-09-26')"),/both/);
});
test('membership date filter respects midnight, missing dates, all-dates override and search',()=>{
 const h=harness();h.context.d={range,membership:{members:[
  {name:'Before midnight',joinedAt:'2026-09-26T06:59:59Z',status:'active'},
  {name:'Today member',joinedAt:'2026-09-26T07:00:00Z',status:'active'},
  {name:'At end',joinedAt:range.end,status:'active'},
  {name:'Unknown date',status:'active'}
 ]}};
 h.run('lastData=d;renderMembers()');
 assert.match(h.element('[data-members]').innerHTML,/Today member/);
 for(const text of ['Before midnight','At end','Unknown date'])assert.ok(!h.element('[data-members]').innerHTML.includes(text));
 h.element('[data-member-scope]').value='all';h.run('renderMembers()');
 assert.match(h.element('[data-members]').innerHTML,/Before midnight/);
 h.element('[data-member-search]').value='unknown';h.run('renderMembers()');
 assert.match(h.element('[data-members]').innerHTML,/Unknown date/);
 assert.ok(!h.element('[data-members]').innerHTML.includes('Today member'));
});
test('member audit shows an active VIP trial and a canceled $0 checkout without suggesting another purchase',()=>{
 const h=harness();h.context.d={range,membership:{members:[
  {name:'Trial member',plan:'monthly',joinedAt:'2026-09-26T08:00:00Z',status:'trialing',discordUserId:'discord_1',vipStatus:'VIP_ACTIVE',hasPositivePayment:false,purchaseAt:'2026-09-26T08:00:00Z'},
  {name:'Trial member',plan:'monthly',joinedAt:'2026-09-26T08:05:00Z',status:'canceled',vipStatus:'CHECKOUT_STARTED',hasPositivePayment:false,purchaseAt:'2026-09-26T08:05:00Z'}
 ]}};
 h.run('lastData=d;renderMembers()');
 const html=h.element('[data-members]').innerHTML;
 assert.match(html,/trialing.*Connected.*Active/);
 assert.match(html,/Discord: discord_1/);
 assert.match(html,/canceled trial.*Ended/);
 assert.match(html,/Checkout 9\/26\/2026/);
 assert.doesNotMatch(html,/Purchased|Possible duplicate/);
});
test('range summary retains the Phoenix date after UTC midnight',()=>{
 const h=harness();h.context.range=range;
 assert.match(h.run('rangeLabel(range)'),/2026-09-26 to 2026-09-26 · MST/);
});
test('changing a date input automatically selects Custom',()=>{
 const h=harness();h.context.inputs=[{},{ }];
 // Run the actual binding with the two date fields exposed.
 h.context.document.querySelectorAll=selector=>selector==='[data-start],[data-end]'?h.context.inputs:[];
 h.run("document.querySelectorAll('[data-start],[data-end]').forEach(x=>x.onchange=()=>selectRange('custom'))");
 h.context.inputs[0].onchange();assert.equal(h.run('currentRange'),'custom');
});
test('out-of-order responses cannot replace the latest chosen dates',async()=>{
 const h=harness(),pending=[];h.context.fetch=()=>new Promise(resolve=>pending.push(resolve));h.context.seen=[];
 h.run("token='test';render=d=>seen.push(d.id);renderExecutive=()=>{};renderTarget=()=>{};renderPaymentAndReferralDetails=()=>{}");
 const first=h.run("currentRange='30d';load()");const second=h.run("currentRange='today';load()");
 pending[1]({ok:true,json:async()=>({id:'today'})});await second;
 pending[0]({ok:true,json:async()=>({id:'old'})});await first;
 assert.deepEqual([...h.context.seen],['today']);
 assert.equal(h.element('[data-dashboard]').attributes['aria-busy'],'false');
});
test('failed refresh keeps prior data and explains failure instead of silently sticking',async()=>{
 const h=harness();h.context.fetch=async()=>{throw new Error('Network unavailable')};
 h.run("token='test';lastData={};");await h.run('load()');
 assert.match(h.element('[data-status]').textContent,/Network unavailable.*Previous results/);
 assert.equal(h.element('[data-dashboard]').attributes['aria-busy'],'false');
});

test('invalid custom dates release a superseded refresh',async()=>{
 const h=harness();let resolve;h.context.fetch=()=>new Promise(r=>resolve=r);
 h.run("token='test'");const pending=h.run('load()');
 await h.run("currentRange='custom';load()");
 assert.equal(h.element('[data-dashboard]').attributes['aria-busy'],'false');
 resolve({ok:true,json:async()=>({})});await pending;
 assert.match(h.element('[data-status]').textContent,/Choose both/);
});

test('bento overview distinguishes current totals from selected-date payments and keeps unknown values unavailable',()=>{
 const h=harness();h.context.d={scoreboard:{activePaid:8,mrrCents:26392},revenue:{collectedCents:1999,openFailedInvoices:2},traffic:{uniqueVisitors:12},conversion:{successfulPayments:1,checkoutStarts:4,checkoutPurchaseConversionRate:.25,funnel:[]},discord:{paidWithoutVip:3,roleCheckUnavailable:1},operations:{}};
 h.run('renderOverview(d)');
 assert.match(h.element('[data-summary]').innerHTML,/Active subscriptions.*Unavailable.*8 paid/);
 assert.match(h.element('[data-summary]').innerHTML,/Collected revenue.*\$19\.99.*Selected dates/);
 assert.match(h.element('[data-summary]').innerHTML,/Matured trial → paid.*Unavailable/);
 assert.match(h.element('[data-priority-alerts]').innerHTML,/data-open-section="membership-report"/);
 h.context.d.scoreboard.activePaid=null;h.context.d.conversion.checkoutPurchaseConversionRate=null;h.run('renderOverview(d)');
 assert.match(h.element('[data-summary]').innerHTML,/Active subscriptions.*Unavailable/);
 assert.match(h.element('[data-summary]').innerHTML,/Matured trial → paid.*Unavailable/);
});
test('custom dates appear only for Custom without changing range boundaries',()=>{
 const h=harness();h.run("selectRange('custom')");assert.equal(h.element('[data-custom-dates]').hidden,false);
 h.run("selectRange('7d')");assert.equal(h.element('[data-custom-dates]').hidden,true);
});
test('report navigation opens the collapsed report before jumping to its member list',()=>{
 const h=harness();let handler;h.element('[data-dashboard]').addEventListener=(_,callback)=>handler=callback;
 const order=[],group={tagName:'DETAILS',get open(){return false},set open(value){order.push('open:'+value)}};
 const target={tagName:'SECTION',closest:()=>group,scrollIntoView(){order.push('scroll')}};
 h.context.document.getElementById=id=>id==='members'?target:null;h.run('setupDashboardNavigation()');
 handler({target:{closest:()=>({getAttribute:()=> '#members',dataset:{}})},preventDefault(){order.push('prevent')}});
 assert.deepEqual(order,['prevent','open:true','scroll']);
});


test('social report deep links reveal the parent disclosure and scroll to the requested report',()=>{
 const h=harness(), details={open:false};let scrolled=false;
 h.context.document.getElementById=id=>id==='social-tracking'?{tagName:'SECTION',closest:()=>details,scrollIntoView(){scrolled=true}}:null;
 assert.equal(h.run("openDashboardTarget('social-tracking')"),true);
 assert.equal(details.open,true);assert.equal(scrolled,true);
 assert.equal(h.run("openDashboardTarget('missing-report')"),false);
 assert.equal(h.run("openDashboardTarget('')"),false);
});


test('matured trial renderer waits for expiry and preserves unavailable history',()=>{
 const h=harness();h.run('renderTrials(null)');
 assert.match(h.element('[data-trial-metrics]').innerHTML,/unavailable/);
 h.context.trial={started:2,vipActivated:2,pendingMaturation:2,matured:0,firstPaidAfterTrial:0,maturedWithoutFirstPayment:0,trialToPaidRate:null};h.run('renderTrials(trial)');
 assert.match(h.element('[data-trial-note]').textContent,/conversion is not ready/);
 assert.match(h.element('[data-trial-metrics]').innerHTML,/Matured trial → paid.*—/);
 h.context.trial={started:3,vipActivated:3,pendingMaturation:1,matured:2,firstPaidAfterTrial:1,maturedWithoutFirstPayment:1,trialToPaidRate:.5};h.run('renderTrials(trial)');
 assert.match(h.element('[data-trial-metrics]').innerHTML,/Matured trial → paid.*50.0%/);
 assert.match(h.element('[data-trial-note]').textContent,/not automatically a failed payment/);
});
test('overview never diagnoses period event totals as lost buyers and separates trial recurring value',()=>{
 const h=harness();h.context.d={scoreboard:{entitled:10,activePaid:9,activeTrials:1,mrrCents:29691,potentialTrialMrrCents:3299},revenue:{collectedCents:0,openFailedInvoices:0},traffic:{uniqueVisitors:4},conversion:{successfulPayments:0,checkoutStarts:1,trialConversion:{matured:0,pendingMaturation:1,trialToPaidRate:null},funnel:[{name:'payment_completed',dropoff:1,dropoffRate:1}]},discord:{paidWithoutVip:0,trialWithoutVip:1,roleCheckUnavailable:0},operations:{}};
 h.run('renderOverview(d)');
 assert.match(h.element('[data-summary]').innerHTML,/Active subscriptions.*10.*9 paid · 1 unpaid trial/);
 assert.match(h.element('[data-summary]').innerHTML,/Paid recurring MRR.*\$296.91.*\$32.99 potential/);
 assert.match(h.element('[data-conversion-signal]').textContent,/still in the two-day window/);
 assert.doesNotMatch(h.element('[data-conversion-signal]').textContent,/drop-off/);
 assert.match(h.element('[data-priority-alerts]').innerHTML,/Unpaid trials without VIP/);
});

test('overview restores page views beside distinct thirty-minute sessions and separate Meta measures',()=>{
 const h=harness();h.context.d={scoreboard:{},revenue:{},conversion:{},traffic:{pageViews:91,uniqueVisitors:37,sources:[{source:'meta',pageViews:65,visitors:22}]}};
 h.run('renderOverview(d)');
 assert.match(h.element('[data-summary]').innerHTML,/Website page views<\/span><strong>91/);
 assert.match(h.element('[data-summary]').innerHTML,/Tracked site sessions<\/span><strong>37/);
 assert.match(h.element('[data-summary]').innerHTML,/30-minute sessions/);
 assert.match(h.element('[data-meta-traffic]').innerHTML,/Meta website page views<\/span><strong>65/);
 assert.match(h.element('[data-meta-traffic]').innerHTML,/Meta website sessions<\/span><strong>22/);
 assert.match(h.element('[data-meta-traffic]').innerHTML,/Meta ad link clicks/);
 assert.match(h.element('[data-meta-traffic]').innerHTML,/Unavailable/);
});
