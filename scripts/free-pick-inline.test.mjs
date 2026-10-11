import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../free-pick.js',import.meta.url),'utf8');
async function flow({image=false,noPick=false,failed=false,trackingFailure=false}={}){
  const node=()=>({hidden:true,textContent:'',children:[],setAttribute(name){this[name]=true;},removeAttribute(name){this[name]=false;},replaceChildren(...children){this.children=children;},addEventListener(){},scrollIntoView(){},remove(){}});
  const selectors=['date','caption','status','image','text-card','selection','line','event','reason','placeholder','gate-form','vip','no-pick-cta'];
  const nodes=Object.fromEntries(selectors.map(name=>[`[data-free-pick-${name}]`,node()]));
  const form=nodes['[data-free-pick-gate-form]'];
  const submit=node(),status=node(),submitText=node();
  form.reportValidity=()=>true;
  form.querySelector=s=>s==='button[type="submit"]'?submit:s==='[data-free-pick-submit-text]'?submitText:status;
  form.addEventListener=(name,handler)=>{form[name]=handler;};
  const vip=nodes['[data-free-pick-vip]'];vip.querySelector=()=>node();
  nodes['[data-free-pick-no-pick-cta]'].querySelector=()=>node();
  const document={querySelector:s=>nodes[s]||null,createElement:()=>node(),querySelectorAll:s=>s==='[data-free-pick-reason] li'?nodes['[data-free-pick-reason]'].children:[]};
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const calls=[];
  const window={};
  if(trackingFailure)window.KBHAnalytics={track(){throw new Error('Analytics unavailable');}};
  const fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/gate'))return{ok:true,json:async()=>({enabled:true,hasPick:!noPick})};
    if(url.endsWith('/unlock'))return{ok:!failed,json:async()=>failed?{error:'Please try again.'}:{ok:true,hasPick:!noPick,pick:{publishedDate:today,imageUrl:image?'https://kobesbettinghub.com/assets/test.png':null,details:{selection:'Utah -15.5',line:'-15.5',sport:'College football',event:'Kansas @ Utah',reason:'First point • Second point\nThird point'}}}};
    return{ok:true,json:async()=>({ok:true})};
  };
  vm.runInNewContext(source,{window,document,fetch,location:{hostname:'kobesbettinghub.com'},sessionStorage:{getItem(){return 'test-session';},setItem(){}},crypto,Intl,Date,FormData:class{get(name){return {email:'test@example.com',legalAge:'on',consent:'on'}[name]||'';}},IntersectionObserver:class{observe(){} disconnect(){}},matchMedia:()=>({matches:true}),console:{warn(){}}});
  await new Promise(resolve=>setImmediate(resolve));
  await form.submit({preventDefault(){}});
  return{w:{document},calls,form,submit,status};
}
test('successful email unlock reveals numbered play inline even if optional analytics fails',async()=>{
  const {w,calls,form}=await flow({trackingFailure:true});
  assert.equal(form.hidden,true);
  assert.equal(w.document.querySelector('[data-free-pick-text-card]').hidden,false);
  assert.equal(w.document.querySelector('[data-free-pick-selection]').textContent,'Utah -15.5');
  assert.equal(w.document.querySelector('[data-free-pick-line]').hidden,true);
  assert.deepEqual([...w.document.querySelectorAll('[data-free-pick-reason] li')].map(e=>e.textContent),['First point','Second point','Third point']);
  assert.equal(w.document.querySelector('[data-free-pick-vip]').hidden,false);
  const payload=JSON.parse(calls.find(c=>c.url.endsWith('/unlock')).options.body);
  assert.equal(payload.legalAge,true);assert.equal(payload.consent,true);
});
test('image pick unlock displays artwork on the website',async()=>{
  const {w}=await flow({image:true});
  assert.equal(w.document.querySelector('[data-free-pick-image]').hidden,false);
  assert.equal(w.document.querySelector('[data-free-pick-text-card]').hidden,true);
});
test('no-pick signup tells the user there is no current pick',async()=>{
  const {w}=await flow({noPick:true});
  assert.equal(w.document.querySelector('[data-free-pick-text-card]').hidden,true);
  assert.match(w.document.querySelector('[data-free-pick-caption]').textContent,/no free pick today/);
});
test('failed unlock retains a retryable email form without revealing the pick',async()=>{
  const {w,form,submit,status}=await flow({failed:true});
  assert.equal(form.hidden,false);
  assert.equal(submit.disabled,false);
  assert.equal(w.document.querySelector('[data-free-pick-text-card]').hidden,true);
  assert.equal(status.textContent,'Please try again.');
});
