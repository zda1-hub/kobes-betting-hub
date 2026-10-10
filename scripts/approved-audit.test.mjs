import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
test('missing welcome credential cannot report checking, a confirmed payment or usable VIP controls',async()=>{
 const nodes=new Map(); for(const key of ['title','message','status','payment','discord','vip','open-discord','vip-start-guide','retry','support'])nodes.set(`[data-${key}]`,{hidden:true,addEventListener(){}});
 let fetched=false;
 const window={__KBH_MEMBERSHIP_CONFIG__:{workerOrigin:'https://worker.test'},history:{state:null,replaceState(){}},dispatchEvent(){}};
 vm.runInNewContext(await read('welcome.js'),{window,location:{search:'',href:'https://site.test/welcome'},URL,URLSearchParams,Event,document:{querySelector:s=>nodes.get(s)},fetch:()=>{fetched=true;}});
 assert.equal(fetched,false);assert.equal(nodes.get('[data-title]').textContent,'An activation link is required');
 assert.equal(nodes.get('[data-payment]').textContent,'Payment: Not verified by this link');
 for(const key of ['retry','open-discord','vip-start-guide'])assert.equal(nodes.get(`[data-${key}]`).hidden,true);
 assert.equal(nodes.get('[data-support]').hidden,false);
});
test('help destination and account headers use current public navigation',async()=>{
 assert.doesNotMatch(await read('support.html'),/discord\.gg\/sB9vzGz2xj\//);
 for(const file of ['welcome.html','member.html','partner.html','creator.html']){
   const html=await read(file);assert.match(html,/<body><header class="site-header" data-header>/);assert.match(html,/audit-polish\.css/);
 }
});
