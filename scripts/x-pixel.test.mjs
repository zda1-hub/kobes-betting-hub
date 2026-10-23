import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../x-pixel.js', import.meta.url), 'utf8');
function browser({ hostname = 'kobesbettinghub.com', search = '', environment = 'production', storage = new Map(), consent = true } = {}) {
  const listeners = new Map();
  const location = { hostname, search };
  const window = {
    __KBH_MEMBERSHIP_CONFIG__: { environment },
    KBHConsent: { allowed: () => consent },
    addEventListener(name, listener) { listeners.set(name, listener); },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  };
  const scripts = [];
  const document = { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore(node) { scripts.push(node); } } }] };
  vm.runInNewContext(source, { window, location, document, URLSearchParams, Number, Set });
  return { window, location, listeners, storage, scripts, events: () => window.twq?.queue.filter(args => args[0] === 'event') || [] };
}

test('X pixel initializes once on consented public pages with the account pixel ID', () => {
  const page = browser();
  assert.equal(page.scripts.length, 1);
  assert.equal(page.scripts[0].src, 'https://static.ads-twitter.com/uwt.js');
  assert.equal(page.window.twq.queue.filter(args => args[0] === 'config' && args[1] === 'rht3t').length, 1);
  page.listeners.get('kbh:tracking-url-ready')();
  assert.equal(page.scripts.length, 1);
});

test('declined consent, previews, staging and private URLs never load the X SDK', () => {
  for (const options of [{ consent: false }, { hostname: 'localhost' }, { environment: 'staging' }, ...['state','session_id','code','token','auth'].map(key => ({ search: `?${key}=private` }))]) {
    const page = browser(options);
    assert.equal(page.window.twq, undefined);
    assert.equal(page.scripts.length, 0);
  }
});

test('private activation URL can initialize only after it has been cleaned', () => {
  const page = browser({ search: '?state=private' });
  page.location.search = '';
  page.listeners.get('kbh:tracking-url-ready')();
  assert.equal(page.window.twq.queue[0][1], 'rht3t');
});

test('prepared checkout, verified trial and paid receipt stay distinct and deduplicate', () => {
  const page = browser();
  const checkout = '12345678-1234-4123-8123-123456789012';
  const trial = { eventId: `trial:${'a'.repeat(64)}` };
  const purchase = { eventId: `purchase:${'b'.repeat(64)}`, value: 32.99, currency: 'USD' };
  assert.equal(page.window.KBHX.trackCheckout('monthly', checkout), true);
  assert.equal(page.window.KBHX.trackCheckout('monthly', checkout), false);
  assert.equal(page.window.KBHX.trackTrial(trial), true);
  assert.equal(page.window.KBHX.trackTrial(trial), false);
  assert.equal(page.window.KBHX.trackPurchase(purchase), true);
  assert.equal(page.window.KBHX.trackPurchase(purchase), false);
  assert.deepEqual(Array.from(page.events(), args => args[1]), ['tw-rht3t-rhuz7','tw-rht3t-rhuz5','tw-rht3t-rhuz6']);
  assert.equal(page.events()[2][2].value, 32.99);
  assert.equal(browser({ storage: page.storage }).window.KBHX.trackTrial(trial), false);
  assert.equal(browser({ storage: page.storage }).window.KBHX.trackPurchase(purchase), false);
});

test('invalid or unpaid data cannot emit trial or purchase', () => {
  const page = browser();
  assert.equal(page.window.KBHX.trackTrial({ eventId: 'sub_private' }), false);
  assert.equal(page.window.KBHX.trackPurchase({ eventId: `purchase:${'b'.repeat(64)}`, value: 0, currency: 'USD' }), false);
  assert.equal(page.events().length, 0);
});
