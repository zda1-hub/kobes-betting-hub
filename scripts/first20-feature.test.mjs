import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../first20-feature.js',import.meta.url),'utf8');
function run({time='2026-10-15T15:00:00Z',search='',enabled=true}={}){
  const inserts=[];
  const ticker={after:el=>inserts.push(el)};
  const promise={before:el=>inserts.push(el)};
  const title={textContent:'Regular title'},terms={textContent:'2 days free'};
  const document={querySelector:s=>s==='[data-primary-membership-checkout]'?{}:s==='.site-ticker'?ticker:s==='.scene-promise'?promise:s==='.membership-tile strong'?title:s==='.membership-tile > span'?terms:null,querySelectorAll:s=>s==='[data-first20-feature]'?inserts:[],createElement:()=>({dataset:{},setAttribute(){}})};
  const window={location:{search}};
  vm.runInNewContext(enabled?source:source.replace('const FEATURE_FIRST20 = true','const FEATURE_FIRST20 = false'),{window,document,URLSearchParams,Date:class extends Date{static now(){return Date.parse(time)}}});
  return {window,inserts,title,terms};
}
test('regular arrivals feature the offer only inside its approved window',()=>{
 assert.equal(run().window.__KBH_FIRST20_FEATURED__,true);
 assert.equal(run({time:'2026-10-15T06:59:59Z'}).inserts.length,0);
 assert.equal(run({time:'2026-10-19T17:00:00Z'}).inserts.length,0);
});
test('referral and checkout-return arrivals retain their own flow',()=>{
 assert.equal(run({search:'?ref=KBH-ABCDEFGHIJ'}).inserts.length,0);
 assert.equal(run({search:'?checkout=success'}).inserts.length,0);
});
test('kill switch restores regular site; sold-out restore hides feature and original copy returns',()=>{
 assert.equal(run({enabled:false}).inserts.length,0);
 const result=run();result.window.__KBH_RESTORE_FIRST20_FEATURE__();
 assert.equal(result.title.textContent,'Regular title');
 assert.equal(result.terms.textContent,'2 days free');
 assert.ok(result.inserts.every(el=>el.hidden));
});

test('banner starts existing eligible checkout without navigating back to join',()=>{
 let handler, clicked=0, prevented=0;
 const primary={disabled:false,dataset:{deal:'first20'},click(){clicked++}};
 const document={querySelector:s=>s==='[data-primary-membership-checkout]'?primary:null,querySelectorAll:()=>[],createElement:()=>({dataset:{},setAttribute(){},addEventListener(type,fn){handler=fn}})};
 vm.runInNewContext(source,{window:{location:{search:''}},document,URLSearchParams,Date:class extends Date{static now(){return Date.parse('2026-10-17T15:00:00Z')}}});
 // The banner is the only element with a click listener.
 handler({target:{closest:()=>true},preventDefault(){prevented++}});
 assert.equal(clicked,1);assert.equal(prevented,1);
 primary.disabled=true;
 handler({target:{closest:()=>true},preventDefault(){}});
 assert.equal(clicked,1);
});
