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
test('dashboard opens on Today and isolates executive totals from filtered metrics',()=>{
  const h=harness();assert.equal(h.run('currentRange'),'today');
  h.element('[data-primary]').innerHTML='filtered result';
  h.context.d={scoreboard:{activePaid:9,mrrCents:29691,newPaidToday:0,cancelledToday:0,netAddsToday:0,newPaidLast7:1}};
  h.run('renderExecutive(d)');
  assert.equal(h.element('[data-primary]').innerHTML,'filtered result');
  assert.match(h.element('[data-current]').innerHTML,/Active subscriptions · now/);
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
test('range summary retains the Phoenix date after UTC midnight',()=>{
 const h=harness();h.context.range=range;
 assert.match(h.run('rangeLabel(range)'),/2026-09-26 to 2026-09-26 · Phoenix time/);
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
