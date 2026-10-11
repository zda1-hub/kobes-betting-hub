import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('exclusives.html', root), 'utf8');
const data = JSON.parse(await readFile(new URL('data/exclusive-directory.json', root), 'utf8'));

test('exclusive directory matches the 120-source Discord roster and preserves known prices', () => {
  assert.equal(data.entries.length, 120);
  const rows = [...html.matchAll(/<tr data-capper-row><td[^>]*>\d+<\/td><th scope="row">([^<]+)<\/th><td[^>]*>([^<]+)<\/td><\/tr>/g)].map(m => ({ name: m[1], price: m[2] }));
  assert.deepEqual(rows, data.entries);
  for (const name of ['A11 Bets', 'AllBets', 'SetPointBets', 'Shark', 'Spartan', 'yourdailycapper']) assert.ok(rows.some(row => row.name === name));
  assert.equal(rows.find(row => row.name === 'AlgoPicks')?.price, '$99/week');
  assert.equal(rows.find(row => row.name === 'A11 Bets')?.price, 'Not listed');
  assert.match(html, /SeekingReturns’ two weekly rates/);
  assert.match(html, /or independently verified current offers/);
  assert.match(html, /not the price of your Hub membership/);
  assert.doesNotMatch(html, /\$8,000|\$8000|guaranteed profits?/i);
});

test('homepage, public manifest and sitemap expose the exclusive directory', { skip: 'Retired pre-Figma homepage structure; directory search and roster remain active checks.' }, async () => {
  const home = await readFile(new URL('index.html', root), 'utf8');
  const homeCss = await readFile(new URL('home.css', root), 'utf8');
  const homeJs = await readFile(new URL('home.js', root), 'utf8');
  const manifest = await readFile(new URL('scripts/prepare-public-site.mjs', root), 'utf8');
  const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
  assert.match(home, /id="exclusives"/);
  assert.match(home, /href="exclusives.html">See the exclusive channel list/);
  assert.match(home, /157 expert sources/);
  assert.match(home, /120 published sources/);
  assert.doesNotMatch(home, /\$7,?000 of value/i);
  assert.match(home, /data-hero-experts/);
  assert.match(homeCss, /\.hero-experts-scroll[^}]*overflow-y:auto/);
  assert.match(homeCss, /\.hero-experts-scroll[^}]*height:282px/);
  assert.match(homeJs, /fetch\('data\/exclusive-directory\.json'/);
  assert.match(homeJs, /localeCompare/);
  assert.match(manifest, /exclusive-directory\.json/);
  for (const file of ['exclusives.html', 'exclusives.css', 'exclusives.js']) assert.ok(manifest.includes(`'${file}'`));
  assert.match(sitemap, /https:\/\/kobesbettinghub.com\/exclusives/);
});

function directoryHarness(reduced = false) {
  const handlers={}, input={value:'',addEventListener(name,fn){handlers['input:'+name]=fn;}};
  const names=['BankrollBill','Teddy Covers',...Array.from({length:18},(_,i)=>`Source ${i}`)];
  const rows=names.map(name=>({hidden:false,querySelector:()=>({textContent:name})}));
  const count={},empty={},controls={},previous={},next={};
  const rail={scrollLeft:0,scrollWidth:4200,clientWidth:300,classList:{add(){},remove(){}},
    addEventListener(name,fn){handlers[name]=fn;},
    scrollTo({left,behavior}){this.scrollLeft=left;this.behavior=behavior;},
    scrollBy({left,behavior}){this.scrollLeft+=left;this.behavior=behavior;}};
  previous.addEventListener=(name,fn)=>handlers.previous=fn;
  next.addEventListener=(name,fn)=>handlers.next=fn;
  const document={getElementById:id=>({'capper-search':input,'lineup-rail':rail,'directory-count':count,'directory-empty':empty})[id],querySelector:selector=>({'[data-directory-controls]':controls,'[data-directory-previous]':previous,'[data-directory-next]':next})[selector],querySelectorAll:()=>rows};
  return {handlers,input,rows,count,empty,controls,previous,next,rail,context:{document,window:{addEventListener(){}},matchMedia:()=>({matches:reduced})}};
}

test('horizontal directory exposes the whole roster and search recovers from no matches', async () => {
  const h=directoryHarness();
  vm.runInNewContext(await readFile(new URL('exclusives.js',root),'utf8'),h.context);
  assert.equal(h.rows.filter(r=>!r.hidden).length,20);
  assert.equal(h.previous.disabled,true); assert.equal(h.next.disabled,false);
  h.rail.scrollLeft=700;
  h.input.value='bankroll bill';h.handlers['input:input']();
  assert.equal(h.count.textContent,'1 expert source');assert.equal(h.rail.scrollLeft,0);
  h.input.value='unknown';h.handlers['input:input']();
  assert.equal(h.empty.hidden,false);assert.equal(h.rail.hidden,true);assert.equal(h.controls.hidden,true);
  h.input.value='';h.handlers['input:input']();
  assert.equal(h.rows.filter(r=>!r.hidden).length,20);assert.equal(h.empty.hidden,true);assert.equal(h.rail.hidden,false);
});

test('horizontal wheel respects boundaries, keyboard reaches the end, and reduced motion stays instant', async () => {
  const h=directoryHarness(true);
  vm.runInNewContext(await readFile(new URL('exclusives.js',root),'utf8'),h.context);
  let prevented=0;
  const wheel={deltaX:0,deltaY:120,deltaMode:0,preventDefault(){prevented++;}};
  h.handlers.wheel(wheel);assert.equal(h.rail.scrollLeft,120);assert.equal(prevented,1);
  h.rail.scrollLeft=3900;h.handlers.wheel(wheel);assert.equal(prevented,1);
  h.rail.scrollLeft=0;h.handlers.wheel({...wheel,deltaY:-120});assert.equal(prevented,1);
  h.handlers.wheel({...wheel,ctrlKey:true});assert.equal(prevented,1);
  h.handlers.next();assert.equal(h.rail.behavior,'instant');assert.equal(h.rail.scrollLeft,255);
  h.handlers.keydown({key:'End',preventDefault(){}});assert.equal(h.rail.scrollLeft,4200);
  h.handlers.scroll();assert.equal(h.next.disabled,true);
  h.handlers.keydown({key:'Home',preventDefault(){}});assert.equal(h.rail.scrollLeft,0);
});
