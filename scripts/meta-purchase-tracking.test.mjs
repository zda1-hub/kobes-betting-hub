import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const pixel = await fs.readFile(new URL('../meta-pixel.js', import.meta.url), 'utf8');
const workerSource = await fs.readFile(new URL('../cloudflare/kobes-checkout-worker.js', import.meta.url), 'utf8');
const { __test: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
function browser({ hostname = 'kobesbettinghub.com', search = '', storage = new Map(), environment = 'production', consent = true } = {}) {
  const listeners = new Map();
  const location = { hostname, search };
  const window = { __KBH_MEMBERSHIP_CONFIG__: { environment }, KBHConsent: { allowed: () => consent }, addEventListener(name, listener) { listeners.set(name, listener); }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  vm.runInNewContext(pixel, { window, location, URLSearchParams, document: { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }] } });
  return { window, location, listeners, storage, events: () => window.fbq?.queue.filter(args => args[0] === 'track') || [] };
}
const receipt = { eventId: `purchase:${'a'.repeat(64)}`, value: 19.99, currency: 'USD' };
test('confirmed purchase queues real amount, currency and stable event ID once across repeated returns', () => {
  const page = browser();
  assert.equal(page.window.KBHMeta.trackPurchase(receipt), true);
  assert.equal(page.window.KBHMeta.trackPurchase(receipt), false);
  const purchase = page.events().find(args => args[1] === 'Purchase');
  assert.equal(purchase[2].value, 19.99); assert.equal(purchase[2].currency, 'USD');
  assert.equal(purchase[3].eventID, receipt.eventId);
  assert.equal(browser({ storage: page.storage }).window.KBHMeta.trackPurchase(receipt), false);
});
test('malformed, unpaid and invalid-currency receipts never queue a purchase', () => {
  const page = browser();
  for (const value of [null, { ...receipt, value: 0 }, { ...receipt, value: -1 }, { ...receipt, value: NaN }, { ...receipt, currency: 'usd' }, { ...receipt, eventId: 'cs_live_private' }]) assert.equal(page.window.KBHMeta.trackPurchase(value), false);
  assert.equal(page.events().some(args => args[1] === 'Purchase'), false);
});
test('private URL prevents SDK and PageView initialization until credential removal', () => {
  for (const key of ['state', 'session_id', 'code', 'token', 'auth']) {
    const page = browser({ search: `?${key}=private` });
    assert.equal(page.window.fbq, undefined);
    page.location.search = ''; page.listeners.get('kbh:tracking-url-ready')();
    assert.equal(page.events()[0][1], 'PageView');
    assert.ok(page.window.fbq.queue.some(args => args[0] === 'set' && args[1] === 'autoConfig' && args[2] === false));
  }
});
test('local, unrelated host and staging never contribute production pixel events', () => {
  for (const options of [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }, { hostname: 'other.example' }, { environment: 'staging' }]) assert.equal(browser(options).window.fbq, undefined);
});
test('declining optional tracking prevents Meta SDK and purchase events', () => {
  const page = browser({ consent: false });
  assert.equal(page.window.fbq, undefined);
  assert.equal(page.window.KBHMeta, undefined);
});
test('prepared checkout intent is explicit and deduplicated without a click handler', () => {
  const page = browser(); const id = '12345678-1234-4123-8123-123456789012';
  assert.equal(page.window.KBHMeta.trackCheckout('first_month_back', id), true);
  assert.equal(page.window.KBHMeta.trackCheckout('first_month_back', id), false);
  assert.equal(page.window.KBHMeta.trackCheckout('bad-offer', id), false);
  assert.equal(page.events().filter(args => args[1] === 'InitiateCheckout').length, 1);
});
test('receipt requires paid live Stripe session bound to confirmed association, preserves USD plan amounts', async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  const association = { id: 'association', status: 'VIP_ACTIVE', stripe_checkout_session_id: 'cs_live_private' };
  const session = { id: association.stripe_checkout_session_id, metadata: { checkout_association_id: association.id }, status: 'complete', payment_status: 'paid', livemode: true, amount_total: 1999, currency: 'usd' };
  let current = session; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(current); };
  const env = { STRIPE_SECRET_KEY: 'test-fixture-only' };
  for (const amount of [1000, 1999, 13499, 19499]) {
    current = { ...session, amount_total: amount }; const result = await worker.verifiedPurchaseReceipt(env, association);
    assert.equal(result.value, amount / 100); assert.equal(result.currency, 'USD'); assert.match(result.eventId, /^purchase:[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(result).includes('cs_live_private'));
  }
  const before = calls; assert.equal(await worker.verifiedPurchaseReceipt(env, { ...association, status: 'CHECKOUT_STARTED' }), null); assert.equal(calls, before);
  for (const patch of [{ payment_status: 'unpaid' }, { payment_status: 'no_payment_required' }, { amount_total: 0 }, { amount_total: -1 }, { amount_total: 19.99 }, { currency: 'JPY' }, { currency: 'bad' }, { status: 'open' }, { livemode: false }, { id: 'another-session' }, { metadata: { checkout_association_id: 'other' } }]) {
    current = { ...session, ...patch }; assert.equal(await worker.verifiedPurchaseReceipt(env, association), null);
  }
});
test('URL cleanup preserves activation verification across reload without persistent token storage', async () => {
  const source = await fs.readFile(new URL('../welcome.js', import.meta.url), 'utf8');
  const history = { state: null, replaceState(state, _title, url) { this.state = state; this.url = url; } };
  const requested = [];
  const run = search => {
    const node = () => ({ addEventListener() {}, hidden: true, textContent: '' });
    const window = { __KBH_MEMBERSHIP_CONFIG__: { workerOrigin: 'https://worker.example' }, history, dispatchEvent() {} };
    vm.runInNewContext(source, { window, location: { href: `https://kobesbettinghub.com/welcome${search}`, search }, URL, URLSearchParams, Event, document: { querySelector: node }, fetch: url => { requested.push(url); return new Promise(() => {}); } });
  };
  run('?state=opaque-private-activation&source=email');
  assert.equal(history.url, '/welcome?source=email');
  assert.equal(history.state.kbhActivationState, 'opaque-private-activation');
  run('');
  assert.equal(requested.length, 2);
  assert.ok(requested.every(url => url.endsWith('state=opaque-private-activation')));
});
