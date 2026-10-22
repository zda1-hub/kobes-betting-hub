import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real site initializer and its registered event handlers without network calls.
const source = readFileSync(new URL('../site.js', import.meta.url), 'utf8').split('// Animate disclosure height')[0];
function page(pathname, { coarse = false, search = '', seen = false } = {}) {
  const handlers = {}, overlays = [], banners = [], storage = new Map();
  if (seen) storage.set('kbh.referral.exit.prompted', '1');
  const main = { id: 'main-content', prepend: e => banners.push(e) };
  const document = {
    activeElement: { focus() {} }, currentScript: { src: 'https://example.test/site.js' },
    body: { children: [], prepend() {}, append: e => overlays.push(e) },
    createElement: () => ({ setAttribute() {}, addEventListener() {}, querySelector: () => ({ addEventListener() {}, focus() {} }) }),
    querySelector: s => s === 'main' ? main : s === '.site-header' ? {} : null,
    querySelectorAll: () => [],
    addEventListener: (name, fn) => { handlers[name] = fn; }, removeEventListener() {},
  };
  const context = { document, location: { pathname, search, hostname: 'example.test', protocol: 'https:', href: `https://example.test${pathname}${search}` }, URL, URLSearchParams, sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) }, matchMedia: q => ({ matches: q.includes(coarse ? 'coarse' : 'fine') }), performance: { now: () => 100 }, scrollY: 0, addEventListener: (name, fn) => { handlers[name] = fn; } };
  vm.runInNewContext(source, context);
  return { overlays, banners, storage, exit: () => handlers.mouseout({ relatedTarget: null, clientY: 0 }), reverseScroll: () => { context.scrollY = 1300; handlers.scroll(); context.scrollY = 800; handlers.scroll(); } };
}
for (const path of [...['/guides/how-to-read-betting-odds-and-line-movement', '/guides/how-to-read-betting-odds-and-line-movement.html', '/guides/how-to-read-betting-odds-and-line-movement/', '/guides/bankroll-management-for-sports-betting', '/guides/bankroll-management-for-sports-betting.html', '/guides/bankroll-management-for-sports-betting/', '/guides/what-a-sports-betting-writeup-should-include', '/guides/what-a-sports-betting-writeup-should-include.html', '/guides/what-a-sports-betting-writeup-should-include/', '/guides/how-to-choose-a-sports-betting-discord', '/guides/how-to-choose-a-sports-betting-discord.html', '/guides/how-to-choose-a-sports-betting-discord/', '/guides/sports-betting-arbitrage-explained', '/guides/sports-betting-arbitrage-explained.html', '/guides/sports-betting-arbitrage-explained/'], '/education', '/education/', '/education/mean-versus-median', '/education/per-game-versus-per-minute.html', '/education/mean-versus-median/']) {
  test(`${path} stays readable on desktop exit and mobile reverse scroll`, () => {
    for (const coarse of [false, true]) {
      const p = page(path, { coarse });
      coarse ? p.reverseScroll() : p.exit();
      assert.equal(p.overlays.length, 0);
      assert.equal(p.storage.has('kbh.referral.exit.prompted'), false);
      assert.equal(p.banners.length, 1, 'ordinary referral banner remains');
    }
  });
}
test('ordinary pages retain desktop and mobile exit behavior', () => {
  for (const coarse of [false, true]) {
    const p = page('/guides', { coarse });
    coarse ? p.reverseScroll() : p.exit();
    assert.equal(p.overlays.length, 1);
    assert.equal(p.storage.get('kbh.referral.exit.prompted'), '1');
    p.exit();
    assert.equal(p.overlays.length, 1, 'no repeat prompt');
  }
});
test('existing checkout, utility and session suppression still apply', () => {
  for (const p of [page('/guides', {search:'?checkout=success'}), page('/privacy'), page('/guides', {seen:true})]) {
    p.exit(); assert.equal(p.overlays.length, 0);
  }
});
