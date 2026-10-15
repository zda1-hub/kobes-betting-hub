import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { default: worker, __test: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const start = Date.parse('2026-10-15T07:00:00Z'), end = Date.parse('2026-10-19T17:00:00Z');
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_MONTHLY_PRICE_ID: 'price_month',
  SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_SECRET_KEY: 'fixture', DISCORD_OAUTH_STATE_SECRET: 'fixture',
  DISCORD_CLIENT_ID: '123', DISCORD_REDIRECT_URI: 'https://worker.test/discord/callback' };
const coupon = () => ({ id: 'kbh_first20_20261015', amount_off: 2799, currency: 'usd', duration: 'once',
  max_redemptions: 20, redeem_by: end / 1000, times_redeemed: 0, valid: true });
function fixture(t, { now = start, couponPatch = {}, pricePatch = {}, absent = false } = {}) {
  t.mock.method(Date, 'now', () => now);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input), body = new URLSearchParams(options.body || '');
    calls.push({ path: url.pathname, method: options.method || 'GET', body, raw: options.body });
    if (url.pathname === '/v1/prices/price_month') return Response.json({ active: true, unit_amount: 3299,
      currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, ...pricePatch });
    if (url.pathname === '/v1/coupons/kbh_first20_20261015') return absent
      ? Response.json({ error: { message: 'No such coupon: fixture' } }, { status: 404 })
      : Response.json({ ...coupon(), ...couponPatch });
    if (url.pathname === '/v1/coupons' && options.method === 'POST') return Response.json(coupon());
    if (url.pathname === '/v1/checkout/sessions') return Response.json({ id: 'cs_test_first20', url: 'https://checkout.stripe.com/fixture' });
    if (url.pathname.endsWith('/membership_checkout_associations') && options.method === 'POST') return Response.json([{ id: 'association_fixture' }]);
    if (url.hostname === 'fixture.supabase.test') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fixture call: ${url.pathname}`);
  });
  return calls;
}
const request = path => new Request(`https://worker.test${path}`, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offer: 'first_month_back', deal: 'first20' }) });

test('MST opening and closing boundaries are exact', () => {
  assert.equal(api.first20Active(start - 1), false);
  assert.equal(api.first20Active(start), true);
  assert.equal(api.first20Active(end - 1), true);
  assert.equal(api.first20Active(end), false);
});
test('before opening and at closing no checkout or association can be created', async t => {
  for (const now of [start - 1, end]) {
    await t.test(String(now), async st => {
      const calls = fixture(st, { now });
      for (const path of ['/checkout/prepare', '/create-checkout']) {
        const response = await worker.fetch(request(path), env);
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /not open/);
      }
      assert.equal(calls.some(c => c.path.endsWith('/checkout/sessions') || c.path.endsWith('/membership_checkout_associations')), false);
    });
  }
});
test('status reports verified scheduled/open/sold-out/ended and never mutates Stripe', async t => {
  for (const [now, patch, state] of [[start - 1, {}, 'scheduled'], [start, {}, 'open'], [start, { times_redeemed: 20, valid: false }, 'sold_out'], [end, {}, 'ended']]) {
    await t.test(state, async st => {
      const calls = fixture(st, { now, couponPatch: patch });
      const result = await (await worker.fetch(new Request('https://worker.test/promotions/first20'), env)).json();
      assert.equal(result.state, state);
      assert.equal(result.firstMonthCents, 500);
      assert.equal(result.renewalCents, 3299);
      assert.equal(calls.some(c => c.path.startsWith('/v1/') && c.method !== 'GET'), false);
    });
  }
});
test('wrong price, currency, coupon duration/cap and exhausted cap cannot create checkout', async t => {
  for (const config of [{ pricePatch: { unit_amount: 3499 } }, { pricePatch: { currency: 'eur' } },
    { couponPatch: { amount_off: 3299 } }, { couponPatch: { duration: 'forever' } },
    { couponPatch: { max_redemptions: 21 } }, { couponPatch: { times_redeemed: 20 } }]) {
    await t.test(JSON.stringify(config), async st => {
      const calls = fixture(st, config);
      const response = await worker.fetch(request('/checkout/prepare'), env);
      assert.equal(response.status, 409);
      assert.equal(calls.some(c => c.path.endsWith('/membership_checkout_associations') || c.path.endsWith('/checkout/sessions')), false);
    });
  }
});
test('open offer prepares the normal Discord-first association without the retired-offer guard', async t => {
  const calls = fixture(t);
  const response = await worker.fetch(request('/checkout/prepare'), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(new URL(result.url).hostname, 'discord.com');
  const association = calls.find(c => c.path.endsWith('/membership_checkout_associations'));
  assert.equal(JSON.parse(association.raw).attribution.promotion, 'first20');
});
test('actual Stripe session parameters charge $5 now with one-time coupon, monthly renewal and no trial', async t => {
  const calls = fixture(t);
  const response = await worker.fetch(request('/create-checkout'), env);
  assert.equal(response.status, 200);
  const checkout = calls.find(c => c.path === '/v1/checkout/sessions').body;
  assert.equal(checkout.get('line_items[0][price]'), 'price_month');
  assert.equal(checkout.get('discounts[0][coupon]'), 'kbh_first20_20261015');
  assert.equal(checkout.get('metadata[promotion]'), 'first20');
  assert.equal(checkout.has('subscription_data[trial_period_days]'), false);
});
test('Discord-associated checkout keeps association metadata and does not grant a free trial', async t => {
  const calls = fixture(t);
  await api.createAssociatedCheckout(env, { id: 'association_fixture', offer: 'first_month_back', status: 'DISCORD_VERIFIED', attribution: { promotion: 'first20' } }, 'public_fixture', 'member_fixture');
  const checkout = calls.find(c => c.path === '/v1/checkout/sessions').body;
  assert.equal(checkout.get('subscription_data[metadata][promotion]'), 'first20');
  assert.equal(checkout.get('metadata[checkout_association_id]'), 'association_fixture');
  assert.equal(checkout.get('discounts[0][coupon]'), 'kbh_first20_20261015');
  assert.equal(checkout.has('subscription_data[trial_period_days]'), false);
});
test('referral rewards cannot be stacked with the $5 deal', async t => {
  const calls = fixture(t);
  for (const path of ['/checkout/prepare', '/create-checkout']) {
    const response = await worker.fetch(new Request(`https://worker.test${path}`, { method: 'POST', body: JSON.stringify({ offer: 'first_month_back', deal: 'first20', referral_code: 'KBC-ABCDEF1234' }) }), env);
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 0);
});

test('missing coupon fails closed without changing Stripe resources', async t => {
  const calls = fixture(t, { absent: true });
  const response = await worker.fetch(request('/checkout/prepare'), env);
  assert.equal(response.status, 409);
  assert.equal(calls.some(c => c.path.startsWith('/v1/') && c.method !== 'GET'), false);
});
