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

test('directory search covers the whole roster, paginates and recovers from no matches', async () => {
  const handlers={}, input={value:'',addEventListener(name,fn){handlers[name]=fn;}};
  const names=['BankrollBill','Teddy Covers',...Array.from({length:18},(_,i)=>`Source ${i}`)];
  const rows=names.map(name=>({hidden:false,querySelector:()=>({textContent:name})}));
  const count={},empty={},more={addEventListener(name,fn){this[name]=fn;}};
  const document={getElementById:id=>({'capper-search':input,'directory-count':count,'directory-empty':empty})[id],querySelector:()=>({after(){}}),querySelectorAll:()=>rows,createElement:()=>more};
  vm.runInNewContext(await readFile(new URL('exclusives.js',root),'utf8'),{document});
  assert.equal(rows.filter(r=>!r.hidden).length,12);assert.equal(more.hidden,false);
  more.click();assert.equal(rows.filter(r=>!r.hidden).length,20);assert.equal(more.hidden,true);
  input.value='bankroll bill';handlers.input();assert.equal(count.textContent,'1 of 1 expert source shown');
  input.value='unknown';handlers.input();assert.equal(empty.hidden,false);assert.equal(count.textContent,'0 of 0 expert sources shown');
  input.value='';handlers.input();assert.equal(rows.filter(r=>!r.hidden).length,12);assert.equal(empty.hidden,true);
});
