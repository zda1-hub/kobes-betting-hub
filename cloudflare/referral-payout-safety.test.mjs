import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { __test: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { SUPABASE_URL: 'https://db.invalid', SUPABASE_SECRET_KEY: 'fake', STRIPE_SECRET_KEY: 'fake', STRIPE_GLOBAL_PAYOUTS_KEY: 'fake', STRIPE_MONTHLY_PRICE_ID: 'price_month' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

// In-memory conditional updates simulate PostgREST compare-and-set semantics.
// No external requests or real payments are made in this test suite.
function fixture(options = {}) {
  const reward = { id: 'reward_1', referrer_discord_user_id: 'referrer', referred_discord_user_id: 'new_member', referred_stripe_customer_id: 'cus_new', referred_subscription_id: 'sub_new', first_paid_invoice_id: 'in_paid', reward_amount_cents: 1000, currency: 'usd', referral_code: 'KBH-TEST', eligible_at: '2020-01-01T00:00:00Z', status: 'HOLDING', payout_attempt_started_at: null, stripe_outbound_payment_id: null, ...options.reward };
  const invoice = { id: 'in_paid', customer: 'cus_new', subscription: 'sub_new', currency: 'usd', amount_paid: 3299, status: 'paid', charge: 'ch_new', ...options.invoice };
  const charge = { id: 'ch_new', customer: 'cus_new', currency: 'usd', amount_captured: 3299, status: 'succeeded', paid: true, captured: true, amount_refunded: 0, refunded: false, disputed: false, payment_method_details: { card: { fingerprint: 'new_card' } }, ...options.charge };
  let sends = 0;
  let invoiceReads = 0;
  const matches = (url) => {
    const filters = url.searchParams;
    const status = filters.get('status');
    if (status?.startsWith('eq.') && reward.status !== status.slice(3)) return false;
    if (status?.startsWith('in.') && !status.slice(4, -1).split(',').includes(reward.status)) return false;
    for (const name of ['stripe_outbound_payment_id', 'payout_attempt_started_at', 'first_paid_invoice_id']) {
      if (filters.get(name) === 'is.null' && reward[name] != null) return false;
    }
    if (filters.get('payout_attempt_started_at')?.startsWith('lte.') && (!reward.payout_attempt_started_at || reward.payout_attempt_started_at > filters.get('payout_attempt_started_at').slice(4))) return false;
    return true;
  };
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.hostname === 'db.invalid') {
      const table = url.pathname.split('/').at(-1);
      if (table === 'referral_rewards') {
        if (init.method === 'PATCH') {
          if (body.status === 'READY' && options.refundBeforeClaim) reward.status = 'VOID';
          if (!matches(url)) return json([]);
          if (body.payment_fingerprint_sha256 && options.duplicateCard) return json({ message: 'unique constraint conflict' }, 409);
          Object.assign(reward, body);
          return json([{ ...reward }]);
        }
        return json(matches(url) ? [{ ...reward }] : []);
      }
      if (table === 'membership_customers') return json([{ stripe_customer_id: 'cus_referrer', current_subscription_id: 'sub_referrer' }]);
      if (table === 'membership_subscriptions') return json(url.searchParams.get('select')?.includes('entitlement_blocked') ? [] : [{ stripe_customer_id: 'cus_referrer', stripe_subscription_id: 'sub_referrer', status: 'active' }]);
      if (table === 'referral_profiles') return json([{ discord_user_id: 'referrer', stripe_recipient_account_id: 'acct_recipient', payout_status: 'READY' }]);
      if (table === 'referral_events' && options.auditFailure && reward.stripe_outbound_payment_id) return json({ message: 'audit unavailable' }, 503);
      return json([]);
    }
    if (url.pathname === '/v1/invoices/in_paid') {
      invoiceReads += 1;
      if (options.refundAfterClaim && invoiceReads === 2) charge.amount_refunded = 100;
      return json(invoice);
    }
    if (url.pathname === '/v1/subscriptions/sub_new') return json({ customer: 'cus_new', metadata: { offer: 'referral_trial', referral_code: 'KBH-TEST', referrer_discord_user_id: 'referrer' }, items: { data: [{ price: 'price_month' }] } });
    if (url.pathname === '/v1/invoice_payments') return json({ data: [{ invoice: invoice.id, status: 'paid', currency: 'usd', amount_paid: 3299, payment: { payment_intent: 'pi_new' } }], has_more: false });
    if (url.pathname === '/v1/payment_intents/pi_new') return json({ status: 'succeeded', customer: 'cus_new', latest_charge: 'ch_new' });
    if (url.pathname === '/v1/charges/ch_new') return options.chargeApiFailure ? json({ error: { message: 'denied' } }, 403) : json(charge);
    if (url.pathname === '/v1/refunds') return json({ data: options.refunds || [], has_more: false });
    if (url.pathname === '/v1/payment_methods') return json({ data: [{ card: { fingerprint: options.sharedCard ? 'new_card' : 'referrer_card' } }], has_more: false });
    if (url.pathname === '/v1/charges') return json({ data: [], has_more: Boolean(options.incompleteHistory) });
    if (url.pathname === '/v2/money_management/financial_accounts') return json({ data: [{ id: 'fa_test' }] });
    if (url.pathname === '/v2/core/accounts/acct_recipient') return json({ configuration: { recipient: { capabilities: { bank_accounts: { local: { status: 'active' } } } } } });
    if (url.pathname === '/v2/money_management/payout_methods') return json({ data: [{ id: 'pm_test' }] });
    if (url.pathname === '/v2/money_management/outbound_payments') {
      sends += 1;
      assert.equal(init.headers['Idempotency-Key'], 'kbh-referral-reward_1');
      assert.equal(body.amount.value, 1000);
      if (options.uncertain) throw new Error('network response lost');
      if (options.refundDuringSend) reward.status = 'REVIEW_REQUIRED';
      return json({ id: 'outbound_test' });
    }
    throw new Error(`Unexpected fake request: ${url.pathname}`);
  };
  return { reward, fetcher, sends: () => sends };
}

async function withFixture(options, run) {
  const state = fixture(options);
  const original = globalThis.fetch;
  globalThis.fetch = state.fetcher;
  try { await run(state); } finally { globalThis.fetch = original; }
}

test('a qualifying referral pays $10 only once and saves its charge/card identity', async () => withFixture({}, async (state) => {
  await api.processReferralPayouts(env);
  await api.processReferralPayouts(env);
  assert.equal(state.sends(), 1);
  assert.equal(state.reward.status, 'PAYOUT_SENT');
  assert.equal(state.reward.qualifying_charge_id, 'ch_new');
  assert.match(state.reward.payment_fingerprint_sha256, /^[a-f0-9]{64}$/);
}));

test('overlapping processors have one atomic winner and one payout', async () => withFixture({}, async (state) => {
  await Promise.all([api.processReferralPayouts(env), api.processReferralPayouts(env)]);
  assert.equal(state.sends(), 1);
}));

for (const [name, options, status] of [
  ['self referral', { reward: { referred_discord_user_id: 'referrer' } }, 'VOID'],
  ['shared referrer card', { sharedCard: true }, 'REVIEW_REQUIRED'],
  ['previously rewarded card on another account', { duplicateCard: true }, 'REVIEW_REQUIRED'],
  ['$10 starter payment', { invoice: { amount_paid: 1000 } }, 'VOID'],
  ['free trial invoice', { invoice: { amount_paid: 0 } }, 'VOID'],
  ['foreign currency', { invoice: { currency: 'eur' } }, 'VOID'],
  ['another customer invoice', { invoice: { customer: 'cus_other' } }, 'VOID'],
  ['another subscription invoice', { invoice: { subscription: 'sub_other' } }, 'VOID'],
  ['partial refund', { charge: { amount_refunded: 1 } }, 'VOID'],
  ['disputed payment', { charge: { disputed: true } }, 'VOID'],
  ['pending refund', { refunds: [{ status: 'pending' }] }, 'REVIEW_REQUIRED'],
  ['missing card fingerprint', { charge: { payment_method_details: {} } }, 'REVIEW_REQUIRED'],
  ['high risk payment', { charge: { outcome: { risk_level: 'highest' } } }, 'REVIEW_REQUIRED'],
  ['charge cannot be read', { chargeApiFailure: true }, 'REVIEW_REQUIRED'],
  ['incomplete referrer history', { incompleteHistory: true }, 'REVIEW_REQUIRED'],
  ['refund before atomic claim', { refundBeforeClaim: true }, 'VOID'],
  ['refund after atomic claim', { refundAfterClaim: true }, 'VOID'],
]) {
  test(`${name} cannot trigger a cash payout`, async () => withFixture(options, async (state) => {
    await api.processReferralPayouts(env);
    assert.equal(state.sends(), 0);
    assert.equal(state.reward.status, status);
  }));
}

test('an uncertain provider result is held and never automatically retried', async () => withFixture({ uncertain: true }, async (state) => {
  await api.processReferralPayouts(env);
  await api.processReferralPayouts(env);
  assert.equal(state.sends(), 1);
  assert.equal(state.reward.status, 'PAYOUT_UNCERTAIN');
}));

test('audit failure after saving the receipt never makes a payout retryable', async () => withFixture({ auditFailure: true }, async (state) => {
  await api.processReferralPayouts(env);
  await api.processReferralPayouts(env);
  assert.equal(state.sends(), 1);
  assert.equal(state.reward.status, 'PAYOUT_SENT');
}));

test('a refund racing the provider preserves review and the payout receipt', async () => withFixture({ refundDuringSend: true }, async (state) => {
  await api.processReferralPayouts(env);
  assert.equal(state.reward.status, 'REVIEW_REQUIRED');
  assert.equal(state.reward.stripe_outbound_payment_id, 'outbound_test');
  await api.processReferralPayouts(env);
  assert.equal(state.sends(), 1);
}));

test('current invoice payment objects are resolved to their actual charge', async () => withFixture({ invoice: { charge: null } }, async (state) => {
  await api.processReferralPayouts(env);
  assert.equal(state.sends(), 1);
}));

test('void/review/legacy failed rewards cannot be revived by invoice replay', async () => {
  for (const status of ['VOID', 'REVIEW_REQUIRED', 'PAYOUT_FAILED', 'PAYOUT_UNCERTAIN', 'PAYOUT_SENT']) {
    await withFixture({ reward: { status } }, async (state) => {
      await api.processReferralInvoicePaid(env, { id: 'in_paid', subscription: 'sub_new', customer: 'cus_new', currency: 'usd', amount_paid: 3299 }, 'evt_replay');
      await api.processReferralPayouts(env);
      assert.equal(state.sends(), 0);
      assert.equal(state.reward.status, status);
    });
  }
});

test('qualification starts the unchanged seven-day hold once', async () => withFixture({ reward: { status: 'PENDING_PAYMENT', first_paid_invoice_id: null } }, async (state) => {
  const paidAt = Math.floor(Date.now() / 1000);
  const invoice = { id: 'in_paid', subscription: 'sub_new', customer: 'cus_new', currency: 'usd', amount_paid: 3299, status_transitions: { paid_at: paidAt } };
  assert.equal(await api.processReferralInvoicePaid(env, invoice, 'evt_paid'), 'REFERRAL_HOLD_STARTED');
  assert.equal(state.reward.status, 'HOLDING');
  assert.equal(Date.parse(state.reward.eligible_at) - paidAt * 1000, 7 * 24 * 60 * 60 * 1000);
  assert.equal(await api.processReferralInvoicePaid(env, invoice, 'evt_replay'), 'HOLDING');
}));

test('an interrupted claimed attempt becomes uncertain instead of being replayed', async () => withFixture({ reward: { status: 'READY', payout_attempt_started_at: '2020-01-01T00:00:00Z' } }, async (state) => {
  await api.processReferralPayouts(env);
  assert.equal(state.reward.status, 'PAYOUT_UNCERTAIN');
  assert.equal(state.sends(), 0);
}));

test('refund webhook cannot overwrite a sent payout with a retryable state', async () => withFixture({ reward: { status: 'PAYOUT_SENT', stripe_outbound_payment_id: 'outbound_test' } }, async (state) => {
  assert.equal(await api.voidReferralForInvoice(env, 'in_paid', 'REFUNDED'), 'REVIEW_REQUIRED');
  assert.equal(state.reward.stripe_outbound_payment_id, 'outbound_test');
}));
