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
  const session = { id: 'cs_live_verified123', mode: 'subscription', status: 'complete', payment_status: long || offer === 'starter' || firstMonthBack ? 'paid' : 'no_payment_required',
    customer: 'cus_verified', subscription: 'sub_verified', currency: 'usd', amount_total: long ? amount : firstMonthBack ? 1999 : offer === 'starter' ? 1000 : 0,
    metadata: { offer }, customer_details: { email: 'member@example.com' } };
  const subscription = { id: 'sub_verified', customer: 'cus_verified', status: long || firstMonthBack ? 'active' : 'trialing', metadata: { offer },
    trial_end: long || firstMonthBack ? null : Math.floor(Date.now() / 1000) + 172800,
    items: { data: [{ quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 864000,
      price: { id: long ? months === 12 ? 'price_year' : 'price_six' : 'price_month', currency: 'usd', unit_amount: amount,
        recurring: { interval: 'month', interval_count: months } } }] } };
  return { session, subscription };
}
test('welcome covers both monthly intros and actual long-term prices', () => {
  for (const offer of ['starter', 'trial_2_day', 'referral_trial', 'first_month_back', 'six_month', 'annual']) {
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
  assert.equal(create.status, 404);
});
test('welcome claim is atomic; a second claim cannot return the private message', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  let claimed = false;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /status=eq.QUEUED/);
    assert.equal(options.method, 'PATCH');
    if (claimed) return Response.json([]);
    claimed = true;
    return Response.json([{ id: '12345678-1234-4234-8234-123456789012', recipient: 'member@example.com', subject: 'Welcome', body: 'Private connection link' }]);
  };
  const config = { MEMBER_WELCOME_QUEUE_SECRET: 'test-secret', SUPABASE_URL: 'https://database.test', SUPABASE_SECRET_KEY: 'test-database' };
  const request = () => new Request('https://worker.test/ops/member-welcomes/claim', { method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: JSON.stringify({ id: '12345678-1234-4234-8234-123456789012' }) });
  assert.equal((await worker.fetch(request(), config)).status, 200);
  assert.equal((await worker.fetch(request(), config)).status, 409);
});
