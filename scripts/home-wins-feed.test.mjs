import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../home-results.js',import.meta.url),'utf8');
async function render(snapshot){
  const node=()=>({children:[],attributes:new Map(),textContent:'',append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},setAttribute(k,v){this.attributes.set(k,v)},hasAttribute(k){return this.attributes.has(k)},querySelector(){return null}});
  const track=node(), rail=node();rail.parentElement=node();track.parentElement=rail;track.setAttribute('data-wins-track','');
  const document={querySelector:s=>s==='[data-wins-track]'?track:null,createElement:node,querySelectorAll:()=>[]};
  vm.runInNewContext(source,{document,location:{hostname:'localhost'},fetch:()=>Promise.resolve({ok:true,json:async()=>snapshot}),KBHResultMetadata:{publicMetadata:x=>x},Date,Intl});
  await new Promise(resolve=>setImmediate(resolve));return track;
}
test('homepage restores verified historical wins even when recent fifty entries contain only losses',async()=>{
  const track=await render({recent:Array.from({length:50},()=>({result:'L'})),wins:[{result:'W',selection:'Verified historical winner',date:'2026-10-01'},{result:'L',selection:'Never display this',date:'2026-10-02'}]});
  assert.equal(track.children.length,1);
  assert.equal(track.children[0].children[2].textContent,'Verified historical winner');
});
test('legacy snapshots still display only verified winning entries',async()=>{
  const track=await render({recent:[{result:'W',selection:'Legacy win',date:'2026-10-12'},{result:'P',selection:'Push',date:'2026-10-12'}]});
  assert.equal(track.children.length,1);
  assert.equal(track.children[0].children[2].textContent,'Legacy win');
});
test('explicit empty verified wins feed does not invent a win from another feed',async()=>{
  const track=await render({wins:[],recent:[{result:'W',selection:'Legacy entry',date:'2026-10-12'}]});
  assert.equal(track.children.length,0);
  assert.match(track.textContent,/No recent verified wins/);
});
