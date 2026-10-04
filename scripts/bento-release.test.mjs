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
      const url = new URL(target.startsWith('/') ? target.slice(1) : target, target.startsWith('/') ? built : new URL(file, built));
      url.search = ''; url.hash = '';
      await access(url);
    }
  }
});

test('production offers retain checkout, configuration and post-payment handoff contracts', async () => {
  for (const file of ['join.html','membership.html']) {
    const html = await read(file);
    for (const offer of ['first_month_back','starter','six_month','annual']) assert.match(html, new RegExp(`data-checkout="${offer}"`));
    for (const hook of ['data-membership-sales','data-membership-confirmation','data-discord-connect','data-connection-title','data-connection-message','data-checkout-message']) assert.ok(html.includes(hook), `${file}: ${hook}`);
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

test('landing wins retain full-record links and proof retains unique inline reviews', async () => {
  const home = await read('index.html');
  assert.match(home, /data-home-record/); assert.match(home, /data-wins-track/);
  assert.match(home, /href="results\.html"[^>]*>Full record, including losses/);
  const proof = await read('proof.html');
  assert.match(proof, /data-verified-results-track/);
  assert.match(proof, /archive/i);
  const reviewTags = [...proof.matchAll(/<figure\b[^>]*class="[^"]*review-card[^>]*data-image="([^"]+)"/g)];
  assert.equal(reviewTags.length, 15);
  assert.doesNotMatch(proof, /<button\b[^>]*class="[^"]*review-card/);
  const hashes = await Promise.all(reviewTags.map(async ([, file]) => createHash('sha256').update(await readFile(new URL(file, built))).digest('hex')));
  assert.equal(new Set(hashes).size, hashes.length);
});

test('public results rendering includes losses and excludes unresolved outcomes', async () => {
  const track = { hasAttribute() { return false; }, parentElement: { addEventListener() {} }, replaceChildren(...cards) { this.cards = cards; } };
  const summary = {};
  const document = {
    querySelector(selector) { return selector === '[data-verified-results-track]' ? track : selector === '[data-home-record]' ? summary : null; },
    createElement(tag) { return { tag, children: [], append(...children) { this.children.push(...children); } }; },
  };
  const recent = ['W','L','P','V','PENDING'].map(result => ({ result, selection: `selection-${result}`, date:'2026-10-04' }));
  let requested;
  vm.runInNewContext(await read('home-results.js'), {
    document, location:{hostname:'kobesbettinghub.com'}, fetch: async url => {
      requested = url;
      return { ok:true, json:async()=>({overall:{wins:1,losses:1,pushes:1,voids:1},recent}) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested, 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results');
  assert.equal(track.cards.length, 4);
  assert.deepEqual(track.cards.map(card=>card.children[1].textContent), ['Win','Loss','Push','Void']);
  assert.match(summary.textContent, /1 wins · 1 losses · 1 pushes · 1 voids/);
});

test('homepage highlights only wins, uses the overall live count and the supplied tracking date', async () => {
  const track = { hasAttribute() { return true; }, parentElement:{addEventListener(){}}, replaceChildren(...cards){this.cards=cards;} };
  const summary = {}, since = {};
  const document = { querySelector(selector){return {'[data-verified-results-track]':track,'[data-home-record]':summary,'[data-tracking-since]':since}[selector] || null;}, createElement(tag){return {tag,children:[],append(...children){this.children.push(...children);}};} };
  const recent = [...Array(20).fill({result:'L'}), {result:'W', selection:'Verified winner', date:'2026-10-04'}, {result:'PENDING'}];
  vm.runInNewContext(await read('home-results.js'), {document,location:{hostname:'kobesbettinghub.com'},fetch:async()=>({ok:true,json:async()=>({overall:{wins:323,losses:299,pushes:11,voids:0},trackingSince:'2026-09-10',recent})})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(track.cards.length,1);
  assert.equal(track.cards[0].children[1].textContent,'Win');
  assert.equal(summary.textContent,'323 tracked wins');
  assert.match(since.textContent,/Since September 10, 2026/);
  assert.match(await read('index.html'),/Winning highlights only/);
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
