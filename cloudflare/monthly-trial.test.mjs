import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { default: worker, __test: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const now = Math.floor(Date.now() / 1000);
const env = { STRIPE_SECRET_KEY: 'test', STRIPE_MONTHLY_PRICE_ID: 'price_month',
  SUPABASE_URL: 'https://db.test', SUPABASE_SECRET_KEY: 'test', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  DISCORD_BOT_TOKEN: 'test', DISCORD_GUILD_ID: 'guild', DISCORD_MEMBER_ROLE_ID: 'vip' };
function fixture() {
  const association = { id: '12345678-1234-4234-8234-123456789012', offer: 'monthly', status: 'CHECKOUT_STARTED',
    discord_user_id: 'member', stripe_checkout_session_id: 'cs_live_trial', stripe_subscription_id: 'sub_trial', stripe_customer_id: 'cus_trial' };
  const session = { id: 'cs_live_trial', mode: 'subscription', status: 'complete', payment_status: 'no_payment_required',
    amount_total: 0, currency: 'usd', customer: 'cus_trial', subscription: 'sub_trial',
    metadata: { offer: 'monthly', checkout_association_id: association.id }, customer_details: { email: 'member@example.com' } };
  const subscription = { id: 'sub_trial', customer: 'cus_trial', status: 'trialing', trial_start: now, trial_end: now + 172800,
    metadata: { ...session.metadata }, items: { data: [{ quantity: 1, price: { id: 'price_month', currency: 'usd',
      unit_amount: 3299, recurring: { interval: 'month', interval_count: 1 } } }] } };
  return { association, session, subscription };
}
test('free access requires the exact two-day monthly trial and matching authoritative Stripe identity', () => {
  const { association, session, subscription } = fixture();
  assert.equal(api.verifiedMonthlyTrial(session, subscription, association, env, now), true);
  assert.equal(api.verifiedMonthlyTrial({ ...session, payment_status: 'paid' }, subscription, association, env, now), true);
  for (const change of [{ status: 'open' }, { payment_status: 'unpaid' }, { amount_total: 100 },
    { customer: 'cus_other' }, { subscription: 'sub_other' }, { metadata: { ...session.metadata, offer: 'annual' } }])
    assert.equal(api.verifiedMonthlyTrial({ ...session, ...change }, subscription, association, env, now), false);
  for (const change of [{ status: 'canceled' }, { trial_end: now - 1 }, { trial_start: now + 1 },
    { trial_end: now + 864000 }, { metadata: { ...subscription.metadata, checkout_association_id: 'other' } },
    { items: { data: [{ ...subscription.items.data[0], price: { ...subscription.items.data[0].price, id: 'price_other' } }] } }])
    assert.equal(api.verifiedMonthlyTrial(session, { ...subscription, ...change }, association, env, now), false);
  assert.equal(api.verifiedMonthlyTrial(session, subscription, { ...association, offer: 'starter' }, env, now), false);
});
function mock(t, state) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  state.analytics = []; state.roles = []; state.events = new Map();
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url); const method = options.method || 'GET';
    if (u.hostname === 'api.stripe.com') {
      if (u.pathname.endsWith('/checkout/sessions/cs_live_trial')) return Response.json(state.session);
      if (u.pathname.endsWith('/subscriptions/sub_trial')) {
        if (method === 'POST') state.subscription.metadata.discord_user_id = 'member';
        return Response.json(state.subscription);
      }
      if (u.pathname.endsWith('/subscriptions/sub_existing')) return Response.json({ id: 'sub_existing', status: 'active' });
      if (u.pathname.endsWith('/invoices/in_paid')) return Response.json(state.invoice);
      throw new Error('Unexpected Stripe route: ' + u.pathname);
    }
    if (u.hostname === 'discord.com') {
      if (u.pathname.includes('/roles/')) state.roles.push(method);
      return u.pathname.endsWith('/users/@me/channels') ? Response.json({ id: 'dm' }) : new Response(null, { status: 204 });
    }
    assert.equal(u.hostname, 'db.test');
    const table = u.pathname.replace('/rest/v1/', '');
    if (method === 'GET') {
      if (table === 'membership_checkout_associations') return Response.json([state.association]);
      if (table === 'membership_customers') return Response.json([{ stripe_customer_id: 'cus_trial', discord_user_id: 'member', current_subscription_id: state.linkedSubscriptionId || null }]);
      if (table === 'membership_subscriptions') return Response.json([{ entitlement_blocked: false }]);
      if (table === 'stripe_webhook_events') {
        const id = u.searchParams.get('event_id')?.slice(3);
        return Response.json(state.events.has(id) ? [state.events.get(id)] : []);
      }
      return Response.json([]);
    }
    const body = JSON.parse(options.body || '{}');
    if (table === 'membership_checkout_associations') Object.assign(state.association, body);
    if (table === 'stripe_webhook_events') state.events.set(body.event_id || u.searchParams.get('event_id')?.slice(3), body);
    if (table === 'analytics_events') state.analytics.push(body);
    return new Response(null, { status: 204 });
  };
}
async function signed(event) {
  const body = JSON.stringify(event);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(now + '.' + body));
  const sig = Buffer.from(hash).toString('hex');
  return worker.fetch(new Request('https://worker.test/stripe-webhook', { method: 'POST',
    headers: { 'Stripe-Signature': `t=${now},v1=${sig}` }, body }), env);
}
test('signed trial checkout activates VIP immediately without recording payment; duplicate does not reactivate', async t => {
  const state = fixture(); mock(t, state);
  const event = { id: 'evt_trial', type: 'checkout.session.completed', created: now, livemode: false, data: { object: state.session } };
  assert.equal((await signed(event)).status, 200);
  assert.equal(state.association.status, 'VIP_ACTIVE');
  assert.deepEqual(state.roles, ['PUT']);
  assert.equal(state.analytics.filter(e => e.event_name === 'payment_completed').length, 0);
  assert.equal(state.analytics.filter(e => e.event_name === 'vip_activated').length, 1);
  const trialStarts = state.analytics.filter(e => e.event_name === 'trial_started');
  assert.equal(trialStarts.length, 1);
  assert.equal(trialStarts[0].dedupe_key, 'trial_started:sub_trial');
  assert.equal(trialStarts[0].properties.verified, true);
  assert.equal(Date.parse(trialStarts[0].properties.trial_end) - Date.parse(trialStarts[0].properties.trial_start), 172800000);
  assert.equal((await signed(event)).status, 200);
  assert.deepEqual(state.roles, ['PUT']);
  assert.equal(state.analytics.filter(e => e.event_name === 'trial_started').length, 1);
  state.subscription.status = 'canceled';
  assert.equal((await signed({ ...event, id: 'evt_cancel', type: 'customer.subscription.deleted', data: { object: state.subscription } })).status, 200);
  assert.deepEqual(state.roles, ['PUT', 'DELETE']);
});
test('Stripe paid status on a zero-dollar trial activates VIP without counting revenue', async t => {
  const state = fixture(); mock(t, state);
  state.session.payment_status = 'paid';
  const event = { id: 'evt_paid_zero_trial', type: 'checkout.session.completed', created: now, livemode: false, data: { object: state.session } };
  assert.equal((await signed(event)).status, 200);
  assert.equal(state.association.status, 'VIP_ACTIVE');
  assert.deepEqual(state.roles, ['PUT']);
  assert.equal(state.analytics.filter(e => e.event_name === 'trial_started').length, 1);
  assert.equal(state.analytics.filter(e => e.event_name === 'payment_completed').length, 0);
});
test('recovery activates a previously recorded zero-dollar trial without counting revenue', async t => {
  const state = fixture(); mock(t, state);
  state.session.payment_status = 'paid';
  const result = await api.recoverCompletedZeroDollarTrials(env);
  assert.deepEqual(result, { checked: 1, activated: 1, duplicateSkipped: 0, failed: 0 });
  assert.equal(state.association.status, 'VIP_ACTIVE');
  assert.deepEqual(state.roles, ['PUT']);
  assert.equal(state.analytics.filter(e => e.event_name === 'payment_completed').length, 0);
});
test('trial recovery does not attach a duplicate subscription to an already active Discord member', async t => {
  const state = fixture(); mock(t, state);
  state.session.payment_status = 'paid';
  state.linkedSubscriptionId = 'sub_existing';
  assert.deepEqual(await api.recoverCompletedZeroDollarTrials(env), { checked: 1, activated: 0, duplicateSkipped: 1, failed: 0 });
  assert.equal(state.association.status, 'CHECKOUT_STARTED');
  assert.deepEqual(state.roles, []);
});
test('unpaid or expired checkout never grants VIP', async t => {
  const state = fixture(); mock(t, state);
  state.session.payment_status = 'unpaid';
  await assert.rejects(api.activateCheckoutAssociation(env, state.association), /not eligible/);
  state.session.payment_status = 'no_payment_required';
  state.subscription.trial_end = now - 1;
  await assert.rejects(api.activateCheckoutAssociation(env, state.association), /verified monthly trial/);
  assert.deepEqual(state.roles, []);
  assert.equal(state.analytics.filter(e => e.event_name === 'trial_started').length, 0);
});
test('first paid renewal is measured for an already-active trial; zero and mismatched invoices never count', async t => {
  const state = fixture(); mock(t, state);
  state.association.status = 'VIP_ACTIVE';
  state.invoice = { id: 'in_paid', customer: 'cus_trial', subscription: 'sub_trial', status: 'paid', amount_paid: 3299, currency: 'usd' };
  assert.equal(await api.recordPaidAssociationInvoice(env, state.association, 'in_paid'), true);
  assert.equal(state.analytics[0].event_name, 'payment_completed');
  assert.equal(state.analytics[0].dedupe_key, 'payment_completed:sub_trial');
  state.analytics.length = 0;
  assert.equal((await signed({ id: 'evt_first_paid', type: 'invoice.paid', created: now, livemode: false, data: { object: state.invoice } })).status, 200);
  assert.equal(state.analytics.filter(e => e.event_name === 'payment_completed').length, 1);
  assert.deepEqual(state.roles, []);
  state.invoice.amount_paid = 0;
  assert.equal(await api.recordPaidAssociationInvoice(env, state.association, 'in_paid'), false);
  state.invoice.amount_paid = 3299; state.invoice.customer = 'cus_other';
  assert.equal(await api.recordPaidAssociationInvoice(env, state.association, 'in_paid'), false);
  assert.equal(state.analytics.length, 1);
});
test('verified Discord checkout uses the two-day trial and requires card collection', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let checkout;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/checkout/sessions')) { checkout = new URLSearchParams(options.body); return Response.json({ id: 'cs_test_created', url: 'https://checkout.stripe.com/test' }); }
    return new Response(null, { status: 204 });
  };
  const { association } = fixture();
  await api.createAssociatedCheckout(env, association, 'test-public-token', 'member');
  assert.equal(checkout.get('subscription_data[trial_period_days]'), '2');
  assert.equal(checkout.get('payment_method_collection'), 'always');
  assert.equal(checkout.get('line_items[0][price]'), 'price_month');
  assert.equal(checkout.get('subscription_data[metadata][checkout_association_id]'), association.id);
});

test('verified $5 first-month payment activates VIP once without recording a free trial', async t => {
  const state = fixture();
  state.association.offer = 'first_month_back';
  state.association.attribution = { promotion: 'first20' };
  state.session.payment_status = 'paid';
  state.session.amount_total = 500;
  state.session.metadata = { ...state.session.metadata, offer: 'first_month_back', promotion: 'first20' };
  state.subscription.status = 'active';
  state.subscription.metadata = { ...state.session.metadata };
  state.subscription.current_period_end = now + 30 * 86400;
  delete state.subscription.trial_start;
  delete state.subscription.trial_end;
  mock(t, state);
  const event = { id: 'evt_paid_first20', type: 'checkout.session.completed', created: now, livemode: false, data: { object: state.session } };
  assert.equal((await signed(event)).status, 200);
  assert.equal(state.association.status, 'VIP_ACTIVE');
  assert.deepEqual(state.roles, ['PUT']);
  assert.equal(state.analytics.filter(e => e.event_name === 'payment_completed').length, 1);
  assert.equal(state.analytics.filter(e => e.event_name === 'trial_started').length, 0);
  assert.equal((await signed(event)).status, 200);
  assert.deepEqual(state.roles, ['PUT']);
});
