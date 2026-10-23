import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { default: worker, __test: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { STRIPE_MONTHLY_PRICE_ID: 'price_month', STRIPE_SIX_MONTH_PRICE_ID: 'price_six', STRIPE_ANNUAL_PRICE_ID: 'price_year' };
function example(offer = 'trial_2_day') {
  const long = ['six_month', 'annual'].includes(offer);
  const firstMonthBack = offer === 'first_month_back';
  const amount = offer === 'annual' ? 19499 : offer === 'six_month' ? 13499 : 3299;
  const months = offer === 'annual' ? 12 : offer === 'six_month' ? 6 : 1;
  const session = { id: 'cs_live_verified123', mode: 'subscription', status: 'complete', payment_status: long || offer === 'starter' || firstMonthBack || offer === 'monthly' ? 'paid' : 'no_payment_required',
    customer: 'cus_verified', subscription: 'sub_verified', currency: 'usd', amount_total: long || offer === 'monthly' ? amount : firstMonthBack ? 1999 : offer === 'starter' ? 1000 : 0,
    metadata: { offer }, customer_details: { email: 'member@example.com' } };
  const subscription = { id: 'sub_verified', customer: 'cus_verified', status: long || firstMonthBack || offer === 'monthly' ? 'active' : 'trialing', metadata: { offer },
    trial_end: long || firstMonthBack || offer === 'monthly' ? null : Math.floor(Date.now() / 1000) + 172800,
    items: { data: [{ quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 864000,
      price: { id: long ? months === 12 ? 'price_year' : 'price_six' : 'price_month', currency: 'usd', unit_amount: amount,
        recurring: { interval: 'month', interval_count: months } } }] } };
  return { session, subscription };
}
test('welcome covers both monthly intros and actual long-term prices', () => {
  for (const offer of ['starter', 'trial_2_day', 'referral_trial', 'first_month_back', 'monthly', 'six_month', 'annual']) {
    const { session, subscription } = example(offer);
    const message = api.memberWelcomeMessage(session, subscription, env);
    assert.equal(message.recipient, 'member@example.com');
    assert.match(message.body, /tap Connect Discord/);
    assert.match(message.body, /managemembership/);
    assert.match(message.body, /session_id=cs_live_verified123/);
    assert.match(message.body, /automatically renews/);
    assert.match(message.body, new RegExp('Checkout total: \\$' + (session.amount_total / 100).toFixed(2).replace('.', '\\.')));
    if (offer === 'first_month_back') assert.match(message.body, /Standard renewal price: \$32\.99 every month/);
  }
});
test('unpaid, canceled, mismatched identities, malformed recipients and unknown prices never produce welcomes', () => {
  const { session, subscription } = example();
  for (const changed of [
    { ...session, payment_status: 'unpaid' }, { ...session, customer: 'cus_other' }, { ...session, subscription: 'sub_other' },
    { ...session, customer_details: { email: 'member@example.com,attacker@example.com' } },
    { ...session, customer_details: { email: 'member@example.com\nBcc:attacker@example.com' } },
  ]) assert.equal(api.memberWelcomeMessage(changed, subscription, env), null);
  for (const changed of [ { ...subscription, status: 'canceled' }, { ...subscription, cancel_at_period_end: true },
    { ...subscription, items: { data: [{ ...subscription.items.data[0], price: { ...subscription.items.data[0].price, id: 'price_unknown' } }] } },
  ]) assert.equal(api.memberWelcomeMessage(session, changed, env), null);
});
test('welcome activation is future-only, production-only and fails closed without configuration', async () => {
  for (const config of [{}, { MEMBER_WELCOME_START_AT: 'invalid' }, { MEMBER_WELCOME_START_AT: new Date().toISOString(), APP_ENV: 'staging' }]) {
    assert.equal(await api.queueMemberWelcome(config, { livemode: true, created: 1 }), false);
  }
  assert.equal(await api.queueMemberWelcome({ MEMBER_WELCOME_START_AT: new Date().toISOString() }, { livemode: false, created: Date.now() / 1000 }), false);
});
test('welcome queue is private and cannot create arbitrary recipient messages', async () => {
  const response = await worker.fetch(new Request('https://worker.test/ops/member-welcomes'), {});
  assert.equal(response.status, 401);
  const create = await worker.fetch(new Request('https://worker.test/ops/member-welcomes', { method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: JSON.stringify({ recipient: 'attacker@example.com' }) }), { MEMBER_WELCOME_QUEUE_SECRET: 'test-secret' });
  assert.equal(create.status, 410);
});
test('legacy Gmail poller cannot read or claim member emails without Resend', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  globalThis.fetch = () => { throw new Error('Retired queue must not access member data'); };
  const config = { MEMBER_WELCOME_QUEUE_SECRET: 'test-secret', SUPABASE_URL: 'https://database.test', SUPABASE_SECRET_KEY: 'test-database' };
  const auth = { authorization: 'Bearer test-secret' };
  const poll = await worker.fetch(new Request('https://worker.test/ops/member-welcomes', { headers: auth }), config);
  assert.equal(poll.status, 410);
  const claim = await worker.fetch(new Request('https://worker.test/ops/member-welcomes/claim', { method: 'POST', headers: auth, body: JSON.stringify({ id: '12345678-1234-4234-8234-123456789012' }) }), config);
  assert.equal(claim.status, 410);
});

test('new monthly trial welcome shows zero today and the recurring price', () => {
  const { session, subscription } = example('monthly');
  session.payment_status = 'no_payment_required'; session.amount_total = 0;
  subscription.status = 'trialing'; subscription.trial_end = Math.floor(Date.now() / 1000) + 172800;
  const message = api.memberWelcomeMessage(session, subscription, env);
  assert.match(message.body, /2 days free, then \$32\.99\/month/);
  assert.match(message.body, /Checkout total: \$0\.00/);
  assert.match(message.body, /Standard renewal price: \$32\.99 every month/);
});

test('a completed trial still receives a Discord setup link when an association exists but activation is pending', () => {
  const { session, subscription } = example('trial_2_day');
  session.metadata.checkout_association_id = '12345678-1234-4234-8234-123456789012';
  const message = api.memberWelcomeMessage(session, subscription, env);
  assert.match(message.body, /tap Connect Discord/);
  assert.match(message.body, /session_id=cs_live_verified123/);
  assert.doesNotMatch(message.body, /being activated automatically/);
});

test('recovery scan ignores checkouts before cutover and already queued subscriptions', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  const now = Math.floor(Date.now() / 1000);
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith('https://api.stripe.com/v1/checkout/sessions?')) return Response.json({ data: [
      { id: 'cs_live_old', livemode: true, mode: 'subscription', subscription: 'sub_old', created: now - 3600 },
      { id: 'cs_live_existing', livemode: true, mode: 'subscription', subscription: 'sub_existing', created: now },
    ], has_more: false });
    if (String(url).includes('/rest/v1/member_welcome_outbox?')) return Response.json([{ id: 'existing' }]);
    if (String(url).includes('/rest/v1/api_call_events')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected call: ${url}`);
  };
  const result = await api.reconcileRecentMemberWelcomes({
    MEMBER_WELCOME_RECONCILE_START_AT: new Date((now - 60) * 1000).toISOString(),
    RESEND_API_KEY: 'configured', SUPABASE_URL: 'https://database.test', SUPABASE_SECRET_KEY: 'test', STRIPE_SECRET_KEY: 'test',
  });
  assert.deepEqual(result, { scanned: 2, queued: 0 });
  assert.equal(calls.filter(url => url.includes('/rest/v1/member_welcome_outbox?')).length, 1);
  assert.equal(calls.filter(url => url.includes('/subscriptions/')).length, 0);
});
