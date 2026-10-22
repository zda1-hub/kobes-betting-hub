import test from 'node:test';
import assert from 'node:assert/strict';
import {createCopyResult} from '../education/copy-result.mjs';
function fixture(clipboard){
 const elements=[];globalThis.document={createElement:()=>({setAttribute(){},addEventListener(name,fn){this[name]=fn},focus(){this.focused=true},select(){this.selected=true}})};
 const copy=createCopyResult({append(...nodes){elements.push(...nodes)}},clipboard);
 return {copy,button:elements[0],status:elements[1],manual:elements[2]};
}
test('copy requires activation, uses current summary and disables stale data',async()=>{
 const writes=[],f=fixture({writeText:async text=>writes.push(text)});f.copy.set('fresh result');assert.equal(writes.length,0);
 await f.button.click();assert.deepEqual(writes,['fresh result']);assert.equal(f.status.textContent,'Result copied.');
 f.copy.set('');assert.equal(f.button.disabled,true);await f.button.click();assert.equal(writes.length,1);assert.equal(f.manual.hidden,true);
});
test('clipboard rejection exposes selectable manual text',async()=>{
 const f=fixture({writeText:async()=>{throw new Error('denied')}});f.copy.set('auditable result');await f.button.click();assert.equal(f.manual.value,'auditable result');assert.equal(f.manual.hidden,false);assert.equal(f.manual.selected,true);assert.match(f.status.textContent,/Select and copy/);
 f.copy.set('new result');assert.equal(f.manual.hidden,true);assert.equal(f.manual.value,'');
});
test('an older async completion cannot confirm a replaced result',async()=>{
 let finish;const f=fixture({writeText:()=>new Promise(resolve=>{finish=resolve})});f.copy.set('old');const pending=f.button.click();f.copy.set('new');finish();await pending;assert.equal(f.status.textContent,'');assert.equal(f.button.disabled,false);
});
