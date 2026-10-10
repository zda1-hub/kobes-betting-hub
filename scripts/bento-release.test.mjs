import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
// Build in an isolated directory: preparation tests rebuild the normal output concurrently.
const repository = new URL('../', import.meta.url);
const isolated = await mkdtemp(path.join(tmpdir(), 'kbh-bento-release-'));
const preparation = await readFile(new URL('scripts/prepare-public-site.mjs', repository), 'utf8');
await mkdir(path.join(isolated, 'scripts'));
await cp(new URL('scripts/prepare-public-site.mjs', repository), path.join(isolated, 'scripts/prepare-public-site.mjs'));
const publicPaths = ['publicFiles', 'guideFiles'].flatMap(name => vm.runInNewContext(preparation.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`))[1]));
for (const file of [...publicPaths, 'assets', 'data/exclusive-directory.json']) {
  const destination = path.join(isolated, file);
  await mkdir(path.dirname(destination), { recursive:true });
  await cp(new URL(file, repository), destination, { recursive:true });
}
await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `const {preparePublicSite} = await import(${JSON.stringify(pathToFileURL(path.join(isolated, 'scripts/prepare-public-site.mjs')).href)}); await preparePublicSite();`], {env:{...process.env, KBH_SITE_ENV:'production', KBH_MEMBERSHIP_WORKER_ORIGIN:''}});
const built = new URL(`file://${isolated}/.public-site/`);
test.after(() => rm(isolated, { recursive:true, force:true }));
const read = file => readFile(new URL(file, built), 'utf8');

test('built shared navigation and local assets resolve on redesigned public routes', async () => {
  for (const file of ['index.html','join.html','membership.html','proof.html','approach.html','results.html','recaps.html','free-pick.html','refer.html','cancel.html','terms.html','privacy.html','guides/index.html']) {
    const html = await read(file);
    assert.match(html, /data-menu-toggle/, file);
    assert.match(html, /src="(?:\.\.\/)?site\.js/, file);
    assert.match(html, /href="(?:\.\.\/)?site\.css/, file);
    for (const [, target] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(target)) continue;
      const pathname = target.split(/[?#]/)[0];
      const localTarget = pathname === '/' ? 'index.html' : pathname === '/guides' ? 'guides/index.html' : target.startsWith('/') && !path.extname(pathname) ? `${pathname.slice(1)}.html${target.slice(pathname.length)}` : target.startsWith('/') ? target.slice(1) : target;
      const url = new URL(localTarget, target.startsWith('/') ? built : new URL(file, built));
      url.search = ''; url.hash = '';
      await access(url);
    }
  }
});

test('production offers retain checkout, configuration and post-payment handoff contracts', async () => {
  for (const file of ['join.html','membership.html']) {
    const html = await read(file);
    const scene = await read('membership-scene.js');
    assert.match(html, /src="membership-scene\.js/);
    for (const offer of ['monthly','starter','six_month']) assert.match(scene, new RegExp(`data-checkout="${offer}"`));
    assert.match(scene, /data-longer-plan="annual"/);
    assert.match(scene, /longerCheckout\.dataset\.checkout=offer/);
    for (const hook of ['data-membership-sales','data-membership-confirmation','data-discord-connect','data-connection-title','data-connection-message','data-checkout-message']) assert.ok(scene.includes(hook), `${file}: ${hook}`);
    assert.equal((html.match(/window\.__KBH_MEMBERSHIP_CONFIG__/g) || []).length, 1);
    assert.match(html, /"environment":"production"/);
    assert.match(html, /https:\/\/kobes-betting-hub-checkout\.kobedirwin\.workers\.dev/);
    assert.match(html, /src="membership\.js/);
    assert.doesNotMatch(html, /data-preview-plan|Updated offers are not connected to checkout/);
  }
});

test('production email form supplies age, consent and honeypot to the existing handler', async () => {
  const html = await read('index.html');
  assert.match(html, /<form[^>]*data-email-signup/);
  for (const name of ['email','legalAge','consent','website']) assert.match(html, new RegExp(`name="${name}"`));
  assert.doesNotMatch(html, /type="checkbox"/);
  for (const name of ['legalAge','consent']) assert.match(html, new RegExp(`<input type="hidden" name="${name}" value="on">`));
  assert.match(html, /By selecting Send, I confirm I am 21\+/);
  assert.match(html, /aria-describedby="email-consent-note"/);
  assert.match(html, /data-email-signup-status/);
  assert.match(html, /src="email-signup\.js/);
  assert.match(html, /href="https:\/\/discord\.gg\/sB9vzGz2xj"/);
  assert.doesNotMatch(html, /href="https:\/\/discord\.com\/channels\//);
  const source = await read('email-signup.js');
  assert.match(source, /api\/email\/subscribe/);
  assert.match(source, /legalAge/); assert.match(source, /consent/);
});

test('landing wins retain their qualified historical estimate and proof retains unique inline reviews', async () => {
  const home = await read('index.html');
  assert.match(home, /KOBE’S HISTORICAL 65% WIN RATE/); assert.match(home, /data-wins-track/);
  assert.match(home, /href="\/?results(?:\.html)?"[^>]*>See winning plays/);
  const proof = await read('proof.html');
  assert.match(proof, /data-verified-results-track/);
  assert.match(proof, /archive/i);
  const reviewTags = [...proof.matchAll(/<figure\b[^>]*class="[^"]*review-card[^>]*data-image="([^"]+)"/g)];
  assert.equal(reviewTags.length, 15);
  assert.doesNotMatch(proof, /<button\b[^>]*class="[^"]*review-card/);
  const hashes = await Promise.all(reviewTags.map(async ([, file]) => createHash('sha256').update(await readFile(new URL(file, built))).digest('hex')));
  assert.equal(new Set(hashes).size, hashes.length);
});

test('public highlights render verified wins and exclude all other outcomes', async () => {
  const track = { hasAttribute() { return false; }, parentElement: { addEventListener() {} }, replaceChildren(...cards) { this.cards = cards; } };
  const summary = {};
  const document = {
    querySelector(selector) { return selector === '[data-verified-results-track]' ? track : selector === '[data-home-record]' ? summary : null; },
    createElement(tag) { return { tag, children: [], append(...children) { this.children.push(...children); } }; },
  };
  const recent = ['W','L','P','V','PENDING'].map(result => ({ result, selection: `selection-${result}`, date:'2026-10-04' }));
  let requested;
  vm.runInNewContext(await read('home-results.js'), {
    KBHResultMetadata:{publicMetadata:item=>item}, document, location:{hostname:'kobesbettinghub.com'}, fetch: async url => {
      requested = url;
      return { ok:true, json:async()=>({overall:{wins:1,losses:1,pushes:1,voids:1},recent}) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested, 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results');
  assert.equal(track.cards.length, 1);
  assert.deepEqual(track.cards.map(card=>card.children[1].textContent), ['✓ WIN']);
  assert.match(summary.textContent, /1 tracked wins and counting/);
});

test('homepage highlights only wins, uses the overall live count and the supplied tracking date', async () => {
  const track = { hasAttribute() { return true; }, parentElement:{addEventListener(){}}, replaceChildren(...cards){this.cards=cards;} };
  const summary = {}, since = {};
  const document = { querySelector(selector){return {'[data-verified-results-track]':track,'[data-home-record]':summary,'[data-tracking-since]':since}[selector] || null;}, createElement(tag){return {tag,children:[],append(...children){this.children.push(...children);}};} };
  const recent = [...Array(20).fill({result:'L'}), {result:'W', selection:'Verified winner', date:'2026-10-04'}, {result:'PENDING'}];
  vm.runInNewContext(await read('home-results.js'), {KBHResultMetadata:{publicMetadata:item=>item},document,location:{hostname:'kobesbettinghub.com'},fetch:async()=>({ok:true,json:async()=>({overall:{wins:323,losses:299,pushes:11,voids:0},trackingSince:'2026-09-10',recent})})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(track.cards.length,1);
  assert.equal(track.cards[0].children[1].textContent,'✓ WIN');
  assert.equal(summary.textContent,'323 tracked wins and counting');
  assert.match(since.textContent,/Since September 10, 2026/);
  const home = await read('index.html');
  assert.match(home, /KOBE’S HISTORICAL 65% WIN RATE/);
  assert.match(home, /Kobe-reported (?:historical )?estimate; complete (?:historical )?supporting records are unavailable/);
  assert.match(home, /See winning plays/);
  assert.doesNotMatch(home, /data-wins-motion/);
});

test('legal and portal artifacts retain current approved operator and secure access', async () => {
  for (const file of ['terms.html','privacy.html']) {
    const html = await read(file);
    assert.match(html, /Kobe Irwin/); assert.match(html, /California/);
    assert.match(html, /EFFECTIVE SEPTEMBER 13, 2026/i);
    assert.match(html, /support@kobesbettinghub\.com/);
  }
  const terms = await read('terms.html');
  assert.match(terms, /card-network rules/); assert.match(terms, /written exception/);
  const portal = await read('cancel.html');
  assert.match(portal, /data-portal-login/);
  assert.match(portal, /Do not purchase again/);
  assert.equal(portal, await read('managemembership.html'));
});

test('wins motion respects reduced motion, focus, manual browsing and four-second idle', async () => {
  const source = await read('home-results.js');
  for (const reduce of [false,true]) {
    const frames=[], listeners={}, controlsListeners={}, buttons={}, timers=[];
    for(const name of ['previous','next']) buttons[name]={addEventListener(type,fn){this[type]=fn;}};
    let focused=false,scroll=0;
    const controls={contains(){return focused;},addEventListener(type,fn){controlsListeners[type]=fn;},querySelector(selector){return buttons[selector.match(/wins-(\w+)/)[1]];}};
    const rail={get scrollLeft(){return scroll;},set scrollLeft(value){scroll=Math.floor(value);},closest(){return controls;},addEventListener(type,fn){listeners[type]=fn;},getBoundingClientRect(){return {top:20,bottom:200};}};
    const track={parentElement:rail,children:[],hasAttribute(name){return name==='data-wins-only';},replaceChildren(...cards){this.children=cards;this.layout();},prepend(...cards){this.children.unshift(...cards);this.layout();},append(...cards){this.children.push(...cards);this.layout();},layout(){this.children.forEach((card,i)=>card.offsetLeft=i*262);}};
    const create=()=>({children:[],append(...nodes){this.children.push(...nodes);},setAttribute(){},cloneNode(){return create();},getBoundingClientRect(){return {width:250};}});
    const document={hidden:false,activeElement:{},querySelector(selector){return selector==='[data-verified-results-track]'?track:null;},querySelectorAll(){return [];},createElement:create};
    vm.runInNewContext(source,{KBHResultMetadata:{publicMetadata:item=>item},document,location:{hostname:'kobesbettinghub.com'},fetch:async()=>({ok:true,json:async()=>({recent:[{result:'W',selection:'A'},{result:'W',selection:'B'}]})}),matchMedia:()=>({matches:reduce,addEventListener(){}}),ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>frames.push(fn),setTimeout(fn,delay){assert.equal(delay,4000);timers.push(fn);},clearTimeout(){},innerHeight:844});
    await new Promise(resolve=>setImmediate(resolve));
    const tick=start=>{for(let time=start;time<start+800;time+=8)frames.shift()(time);};
    const initial=scroll;tick(8);if(reduce)assert.equal(scroll,initial);else assert.ok(scroll>initial+40);
    let prevented=false;listeners.wheel({deltaX:0,deltaY:25,preventDefault(){prevented=true;}});assert.equal(prevented,false);
    focused=true;controlsListeners.focusin();timers.at(-1)();const stopped=scroll;tick(808);assert.equal(scroll,stopped);
    focused=false;controlsListeners.focusout();timers.at(-1)();tick(1608);if(reduce)assert.equal(scroll,stopped);else assert.ok(scroll>stopped+40);
  }
});
