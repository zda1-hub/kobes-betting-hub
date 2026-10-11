import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../guides/learning.js', import.meta.url), 'utf8');
function harness({fail=false, empty=false}={}) {
  let calls=0, handler, inserted=false;
  const status={textContent:'Loading guide…'};
  const reader={dataset:{guideUrl:'odds.html'},setAttribute(){},removeAttribute(){},querySelector(){return status;},replaceChildren(){inserted=true;}};
  const details={open:true,querySelector(){return reader;},addEventListener(_,fn){handler=fn;}};
  vm.runInNewContext(source, {
    document:{querySelectorAll(){return [details];},createDocumentFragment(){return {append(){},querySelectorAll(){return [];}};}},
    DOMParser:class {parseFromString(){return {querySelector(){return empty?null:{querySelector(){return {textContent:'Guide'};}};}};}},
    URL,WeakMap,AbortSignal,location:{href:'https://example.com/guides/',origin:'https://example.com'},
    matchMedia(){return {matches:true};},
    async fetch(){calls++;return {ok:!fail,url:'https://example.com/guides/odds',async text(){return '<main>Guide</main>';}};}
  });
  return {reader,status,async toggle(open=true){details.open=open;handler();await new Promise(resolve=>setImmediate(resolve));},calls:()=>calls,inserted:()=>inserted};
}
test('reopening a loaded guide uses cached content; a closed guide does not fetch',async()=>{
  const h=harness();await h.toggle(false);assert.equal(h.calls(),0);
  await h.toggle();await h.toggle(false);await h.toggle();assert.equal(h.calls(),1);assert.equal(h.inserted(),true);
});
test('failed response shows full-guide fallback and allows retry',async()=>{
  const h=harness({fail:true});await h.toggle();assert.match(h.status.textContent,/Open the full guide/);
  await h.toggle(false);await h.toggle();assert.equal(h.calls(),2);assert.equal(h.inserted(),false);
});
test('missing article content is not reported as a successful load',async()=>{
  const h=harness({empty:true});await h.toggle();assert.equal(h.inserted(),false);assert.match(h.status.textContent,/couldn’t load/);
});
