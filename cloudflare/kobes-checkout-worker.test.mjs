import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const worker = workerModule.default;
const workerTest = workerModule.__test;

const encoder = new TextEncoder();

async function stripeSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const value = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return { timestamp, value };
}

test('checkout worker health endpoint responds without credentials', async () => {
  const response = await worker.fetch(new Request('https://worker.test/health'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, version: null });
});

test('legacy checkout-session cancellation endpoints are disabled', async () => {
  const response = await worker.fetch(new Request('https://worker.test/cancel/offer?session_id=cs_test_leaked'), {});
  assert.equal(response.status, 410);
  assert.match((await response.json()).error, /Stripe Customer Portal/);
});

test('billing portal fails closed until Discord and Supabase are configured', async () => {
  const response = await worker.fetch(new Request('https://worker.test/discord/login?intent=portal'), {});
  assert.equal(response.status, 503);
  assert.match(await response.text(), /being configured/);
});

test('oversized Stripe webhooks are rejected before buffering', async () => {
  const response = await worker.fetch(new Request('https://worker.test/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Length': '1000001' },
    body: '{}'
  }), {});
  assert.equal(response.status, 413);
});

test('oversized chunked Stripe webhooks are rejected without a Content-Length header', async () => {
  const response = await worker.fetch(new Request('https://worker.test/stripe-webhook', {
    method: 'POST',
    body: 'x'.repeat(1_000_001),
  }), {});
  assert.equal(response.status, 413);
});

test('checkout worker exposes a scheduled membership reconciliation handler', () => {
  assert.equal(typeof worker.scheduled, 'function');
});

test('new referral rewards are configured for ten dollars', () => {
  assert.equal(workerTest.REFERRAL_REWARD_CENTS, 1000);
});

test('cash payouts use the amount stored on each immutable reward', () => {
  assert.equal(workerTest.referralPayoutAmount({ reward_amount_cents: 1000 }), 1000);
  assert.equal(workerTest.referralPayoutAmount({ reward_amount_cents: 2000 }), 2000);
  assert.throws(() => workerTest.referralPayoutAmount({ reward_amount_cents: 9999 }), /amount is invalid/);
});

test('Stripe v2 account retrieval uses indexed include parameters', () => {
  const query = new URLSearchParams(workerTest.stripeV2IncludeQuery(['configuration.recipient']));
  assert.equal(query.get('include[0]'), 'configuration.recipient');
  assert.equal(query.has('include[]'), false);
});

test('referral recipient readiness requires an active capability and payout method', () => {
  assert.equal(workerTest.referralRecipientIsReady({ status: 'active' }, 'pm_test_bank'), true);
  assert.equal(workerTest.referralRecipientIsReady({ status: 'pending' }, 'pm_test_bank'), false);
  assert.equal(workerTest.referralRecipientIsReady({ status: 'active' }, ''), false);
});

test('staging return URLs fail closed instead of falling back to production', () => {
  const stagingOrigin = 'https://kobes-betting-hub-staging.kobedirwin.workers.dev';
  assert.equal(workerTest.siteOrigin({ APP_ENV: 'staging', SITE_ORIGIN: stagingOrigin }), stagingOrigin);
  assert.equal(workerTest.siteOrigin({ APP_ENV: 'production', SITE_ORIGIN: stagingOrigin }), 'https://kobesbettinghub.com');
  assert.throws(() => workerTest.siteOrigin({ APP_ENV: 'staging' }), /not configured safely/);
  assert.throws(() => workerTest.siteOrigin({ APP_ENV: 'staging', SITE_ORIGIN: 'https://kobesbettinghub.com' }), /not configured safely/);
});

test('current Stripe subscription shapes retain item periods and explicit cancellation time', () => {
  assert.equal(workerTest.subscriptionCancellationEnd({
    cancel_at: 1_800_000_000,
    items: { data: [{ current_period_end: 1_900_000_000 }] },
  }), 1_800_000_000);
  assert.equal(workerTest.subscriptionCancellationEnd({
    items: { data: [{ current_period_end: 1_900_000_000 }] },
  }), 1_900_000_000);
  assert.equal(workerTest.subscriptionCancellationEnd({ trial_end: 2_000_000_000 }), 2_000_000_000);
});

test('retention coupon matching supports current and legacy Stripe discount shapes', () => {
  assert.equal(workerTest.subscriptionHasCoupon({
    discounts: [{ source: { type: 'coupon', coupon: 'coupon_retention' } }],
  }, 'coupon_retention'), true);
  assert.equal(workerTest.subscriptionHasCoupon({
    discount: { coupon: { id: 'coupon_retention' } },
  }, 'coupon_retention'), true);
  assert.equal(workerTest.subscriptionHasCoupon({ discounts: ['di_unexpanded'] }, 'coupon_retention'), false);
});

test('portal cancellation flow offers the single-redemption member coupon only to an unused customer', () => {
  const env = {
    STRIPE_RETENTION_COUPON_ID: 'coupon_retention',
    STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_guarded',
  };
  const membership = { stripe_customer_id: 'cus_member', current_subscription_id: 'sub_member' };
  const subscription = { id: 'sub_member', status: 'active', customer: 'cus_member', metadata: {}, discounts: [] };
  const eligible = workerTest.portalSessionValues(membership, { metadata: {} }, subscription, env, 'coupon_member');
  assert.equal(eligible.configuration, 'bpc_guarded');
  assert.equal(eligible['flow_data[type]'], 'subscription_cancel');
  assert.equal(eligible['flow_data[subscription_cancel][subscription]'], 'sub_member');
  assert.equal(eligible['flow_data[subscription_cancel][retention][coupon_offer][coupon]'], 'coupon_member');

  const used = workerTest.portalSessionValues(membership, { metadata: { kbh_retention_offer_used: 'true' } }, subscription, env, 'coupon_member');
  assert.equal(used['flow_data[type]'], 'subscription_cancel');
  assert.equal(used['flow_data[subscription_cancel][retention][coupon_offer][coupon]'], undefined);
  assert.equal(workerTest.retentionOfferUsed(
    { metadata: { kbh_retention_offer_coupon: 'coupon_member' } },
    { ...subscription, discounts: [{ source: { coupon: 'coupon_member' } }] },
    'coupon_retention',
  ), true);
});

test('retention provisioning creates one 75-percent once coupon capped to one redemption per customer', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(url);
    requests.push({ path: requestUrl.pathname, body: new URLSearchParams(options.body), idempotencyKey: new Headers(options.headers).get('Idempotency-Key') });
    if (requestUrl.pathname === '/v1/coupons') return Response.json({ id: 'coupon_member' });
    if (requestUrl.pathname.startsWith('/v1/customers/')) {
      return Response.json({ id: requestUrl.pathname.split('/').at(-1), metadata: { kbh_retention_offer_coupon: 'coupon_member' } });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    STRIPE_RETENTION_COUPON_ID: 'coupon_template',
    STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_guarded',
  };

  assert.equal(await workerTest.ensurePerMemberRetentionCoupon(env, { id: 'cus_member', metadata: {} }), 'coupon_member');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, '/v1/coupons');
  assert.equal(requests[0].body.get('percent_off'), '75');
  assert.equal(requests[0].body.get('duration'), 'once');
  assert.equal(requests[0].body.get('max_redemptions'), '1');
  assert.equal(requests[0].idempotencyKey, 'kbh-retention-coupon-cus_member');
  assert.equal(requests[1].body.get('metadata[kbh_retention_offer_coupon]'), 'coupon_member');

  requests.length = 0;
  assert.equal(await workerTest.ensurePerMemberRetentionCoupon(env, {
    id: 'cus_member', metadata: { kbh_retention_offer_coupon: 'coupon_member' },
  }), 'coupon_member');
  assert.equal(requests.length, 0);

  requests.length = 0;
  assert.equal(await workerTest.ensurePerMemberRetentionCoupon(
    { ...env, STRIPE_PORTAL_CONFIGURATION_ID: '' },
    { id: 'cus_other', metadata: {} },
  ), 'coupon_member');
  assert.equal(requests.length, 2);
});
test('Stripe signature verification accepts any valid v1 signature during secret rotation', async () => {
  const payload = JSON.stringify({ id: 'evt_test_rotation' });
  const secret = 'whsec_test_rotation';
  const { timestamp, value } = await stripeSignature(payload, secret);

  assert.equal(
    await workerTest.verifyStripeSignature(payload, `t=${timestamp},v1=${value},v1=${'0'.repeat(64)}`, secret),
    true,
  );
  assert.equal(
    await workerTest.verifyStripeSignature(payload, `t=${timestamp - 301},v1=${value}`, secret),
    false,
  );
});

test('Discord OAuth state is signed, scoped, and rejects tampering', async () => {
  const env = { DISCORD_OAUTH_STATE_SECRET: 'test-state-secret' };
  const state = await workerTest.createDiscordState({ sessionId: 'cs_test_123', intent: 'connect' }, env);
  const decoded = await workerTest.readDiscordState(state, env);

  assert.equal(decoded.sessionId, 'cs_test_123');
  assert.equal(decoded.intent, 'connect');
  const replacement = state.endsWith('a') ? 'b' : 'a';
  await assert.rejects(() => workerTest.readDiscordState(`${state.slice(0, -1)}${replacement}`, env), /Invalid Discord/);

  const oauthEnv = { DISCORD_CLIENT_ID: 'client_test', DISCORD_REDIRECT_URI: 'https://worker.test/discord/callback' };
  assert.equal(new URL(workerTest.discordAuthorizationUrl(state, oauthEnv, 'portal')).searchParams.get('scope'), 'identify');
  assert.equal(new URL(workerTest.discordAuthorizationUrl(state, oauthEnv, 'connect')).searchParams.get('scope'), 'identify guilds.join');
  assert.equal(new URL(workerTest.discordAuthorizationUrl(state, oauthEnv, 'referral')).searchParams.get('scope'), 'identify email');
});

test('checkout offer composition matches the published intro pricing without charging in the test', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), body: String(options.body || ''), headers: new Headers(options.headers) });
    return Response.json({ url: 'https://checkout.stripe.test/session' }, { headers: { 'request-id': 'req_test' } });
  };
  const env = {
    APP_ENV: 'staging',
    SITE_ORIGIN: 'https://kobes-betting-hub-staging.kobedirwin.workers.dev',
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
    STRIPE_STARTER_PRICE_ID: 'price_starter',
  };

  const starter = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Checkout-Request-Id': 'fa8b14dd-1c67-4cbe-8308-52a750d0e534' }, body: JSON.stringify({ offer: 'starter' }),
  }), env);
  const trial = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Checkout-Request-Id': 'f054a06e-a74b-439f-a56d-b0be5f6cc613' }, body: JSON.stringify({ offer: 'trial_2_day' }),
  }), env);

  assert.equal(starter.status, 200);
  assert.equal(trial.status, 200);
  const starterForm = new URLSearchParams(requests[0].body);
  const trialForm = new URLSearchParams(requests[1].body);
  assert.equal(starterForm.get('mode'), 'subscription');
  assert.equal(starterForm.get('line_items[0][price]'), 'price_monthly');
  assert.equal(starterForm.get('line_items[1][price]'), 'price_starter');
  assert.equal(starterForm.get('subscription_data[trial_period_days]'), '7');
  assert.equal(starterForm.get('success_url'), 'https://kobes-betting-hub-staging.kobedirwin.workers.dev/membership.html?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  assert.equal(starterForm.get('cancel_url'), 'https://kobes-betting-hub-staging.kobedirwin.workers.dev/membership.html?checkout=cancel');
  assert.equal(trialForm.get('line_items[0][price]'), 'price_monthly');
  assert.equal(trialForm.has('line_items[1][price]'), false);
  assert.equal(trialForm.get('subscription_data[trial_period_days]'), '2');
  assert.equal(trialForm.get('payment_method_collection'), 'always');
  assert.equal(requests[0].headers.get('Idempotency-Key'), 'fa8b14dd-1c67-4cbe-8308-52a750d0e534');
  assert.equal(requests[1].headers.get('Idempotency-Key'), 'f054a06e-a74b-439f-a56d-b0be5f6cc613');
});

test('referral checkout is locked to the two-day monthly offer and records the stable Discord referrer ID', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const stripeRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(url);
    if (requestUrl.hostname === 'project.supabase.test') {
      const table = requestUrl.pathname.replace('/rest/v1/', '');
      if (table === 'referral_profiles') return Response.json([{ discord_user_id: 'discord_referrer', referral_code: 'KBH-ABCDEF1234', stripe_recipient_account_id: null, payout_status: 'NOT_CONNECTED' }]);
      if (table === 'membership_customers') return Response.json([{ stripe_customer_id: 'cus_referrer', current_subscription_id: 'sub_referrer' }]);
      if (table === 'membership_subscriptions') return Response.json([{ stripe_subscription_id: 'sub_referrer', stripe_customer_id: 'cus_referrer', status: 'active' }]);
      if (table === 'api_call_events') return new Response(null, { status: 204 });
    }
    assert.equal(requestUrl.hostname, 'api.stripe.com');
    stripeRequests.push({ url: String(url), body: String(options.body || '') });
    return Response.json({ url: 'https://checkout.stripe.test/referral-session' }, { headers: { 'request-id': 'req_referral_test' } });
  };
  const response = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Checkout-Request-Id': 'f054a06e-a74b-439f-a56d-b0be5f6cc613' },
    body: JSON.stringify({ offer: 'referral_trial', referral_code: 'KBH-ABCDEF1234' }),
  }), {
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
    SUPABASE_URL: 'https://project.supabase.test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
  });

  assert.equal(response.status, 200);
  const checkout = new URLSearchParams(stripeRequests[0].body);
  assert.equal(checkout.get('line_items[0][price]'), 'price_monthly');
  assert.equal(checkout.has('line_items[1][price]'), false);
  assert.equal(checkout.get('subscription_data[trial_period_days]'), '2');
  assert.equal(checkout.get('metadata[offer]'), 'referral_trial');
  assert.equal(checkout.get('metadata[referral_code]'), 'KBH-ABCDEF1234');
  assert.equal(checkout.get('subscription_data[metadata][referrer_discord_user_id]'), 'discord_referrer');
});

test('invoice subscription extraction supports current and legacy Stripe invoice shapes', () => {
  assert.equal(workerTest.invoiceSubscriptionId({ subscription: 'sub_legacy' }), 'sub_legacy');
  assert.equal(workerTest.invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_current' } } }), 'sub_current');
});

test('checkout rejects malformed client request IDs before contacting Stripe', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return Response.json({ url: 'https://checkout.stripe.test/session' });
  };
  const response = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Checkout-Request-Id': 'not-a-uuid' },
    body: JSON.stringify({ offer: 'starter' }),
  }), {
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
    STRIPE_STARTER_PRICE_ID: 'price_starter',
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /request ID/);
  assert.equal(fetchCalls, 0);
});

test('checkout remains compatible with clients that omit a request ID', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let idempotencyKey = '';
  globalThis.fetch = async (_url, options = {}) => {
    idempotencyKey = new Headers(options.headers).get('Idempotency-Key');
    return Response.json({ url: 'https://checkout.stripe.test/session' });
  };
  const response = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offer: 'trial_2_day' }),
  }), {
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
  });

  assert.equal(response.status, 200);
  assert.match(idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('checkout CORS preflight permits the request ID header', async () => {
  const response = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'OPTIONS',
    headers: { Origin: 'https://kobesbettinghub.com' },
  }), {});
  assert.equal(response.status, 204);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /X-Checkout-Request-Id/);
});

test('checkout CORS permits the isolated staging site origin', async () => {
  const stagingOrigin = 'https://kobes-betting-hub-staging.kobedirwin.workers.dev';
  const response = await worker.fetch(new Request('https://worker.test/create-checkout', {
    method: 'OPTIONS',
    headers: { Origin: stagingOrigin },
  }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), stagingOrigin);
});

test('a checkout customer can claim only one Discord identity', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const customers = new Map();
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.hostname, 'project.supabase.test');
    assert.equal(requestUrl.pathname, '/rest/v1/membership_customers');
    const method = options.method || 'GET';
    const stripeFilter = requestUrl.searchParams.get('stripe_customer_id');
    const discordFilter = requestUrl.searchParams.get('discord_user_id');
    if (method === 'POST') {
      const body = JSON.parse(options.body);
      const current = customers.get(body.stripe_customer_id) || { stripe_customer_id: body.stripe_customer_id, discord_user_id: null };
      customers.set(body.stripe_customer_id, { ...current, ...body });
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      const customerId = stripeFilter?.replace(/^eq\./, '');
      const current = customers.get(customerId);
      if (!current || current.discord_user_id !== null) return Response.json([]);
      const updated = { ...current, ...JSON.parse(options.body) };
      customers.set(customerId, updated);
      return Response.json([updated]);
    }
    if (stripeFilter) {
      const row = customers.get(stripeFilter.replace(/^eq\./, ''));
      return Response.json(row ? [row] : []);
    }
    if (discordFilter) {
      const discordUserId = discordFilter.replace(/^eq\./, '');
      return Response.json([...customers.values()].filter((row) => row.discord_user_id === discordUserId));
    }
    throw new Error(`Unexpected Supabase request: ${method} ${requestUrl}`);
  };
  const env = { SUPABASE_URL: 'https://project.supabase.test', SUPABASE_SECRET_KEY: 'sb_secret_test' };

  await workerTest.claimDiscordLink(env, 'cus_test_one', 'sub_test_one', 'discord_one');
  assert.equal(customers.get('cus_test_one').discord_user_id, 'discord_one');
  await workerTest.claimDiscordLink(env, 'cus_test_one', 'sub_test_one', 'discord_one');
  await assert.rejects(
    () => workerTest.claimDiscordLink(env, 'cus_test_one', 'sub_test_one', 'discord_two'),
    /already connected to another Discord account/,
  );
  await assert.rejects(
    () => workerTest.claimDiscordLink(env, 'cus_test_two', 'sub_test_two', 'discord_one'),
    /already connected to another membership/,
  );
});

test('verified subscription webhooks grant and remove roles exactly once per event', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const webhookEvents = new Map();
  const discordRoleCalls = [];
  const apiCallEvents = [];
  const subscriptionWrites = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(url);
    const method = options.method || 'GET';
    if (requestUrl.hostname === 'discord.com') {
      discordRoleCalls.push({ path: requestUrl.pathname, method });
      return new Response(null, { status: 204 });
    }
    assert.equal(requestUrl.hostname, 'project.supabase.test');
    const table = requestUrl.pathname.replace('/rest/v1/', '');
    if (table === 'stripe_webhook_events') {
      const eventId = requestUrl.searchParams.get('event_id')?.replace(/^eq\./, '');
      if (method === 'GET') return Response.json(webhookEvents.has(eventId) ? [webhookEvents.get(eventId)] : []);
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        webhookEvents.set(body.event_id, body);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        webhookEvents.set(eventId, { ...webhookEvents.get(eventId), ...JSON.parse(options.body) });
        return new Response(null, { status: 204 });
      }
    }
    if (table === 'api_call_events' && method === 'POST') {
      apiCallEvents.push(JSON.parse(options.body));
      return new Response(null, { status: 204 });
    }
    if (table === 'membership_subscriptions') {
      if (method === 'POST') {
        subscriptionWrites.push(JSON.parse(options.body));
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        subscriptionWrites.push(JSON.parse(options.body));
        return new Response(null, { status: 204 });
      }
      if (method === 'GET') return Response.json([{ entitlement_blocked: false, entitlement_block_reason: null }]);
    }
    if (table === 'membership_customers' && method === 'POST') {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected external request: ${method} ${requestUrl}`);
  };
  const secret = 'whsec_local_webhook';
  const env = {
    STRIPE_WEBHOOK_SECRET: secret,
    SUPABASE_URL: 'https://project.supabase.test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    DISCORD_BOT_TOKEN: 'discord_bot_test',
    DISCORD_GUILD_ID: 'guild_test',
    DISCORD_MEMBER_ROLE_ID: 'role_test',
    CF_VERSION_METADATA: { id: 'worker-version-test' },
  };
  const makeEvent = (id, type, status) => ({
    id,
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: 'sub_test_member',
        customer: 'cus_test_member',
        status,
        created: Math.floor(Date.now() / 1000),
        cancel_at_period_end: false,
        cancel_at: 1_800_000_000,
        metadata: { discord_user_id: 'discord_member' },
        items: { data: [{
          price: { id: 'price_test_monthly' },
          current_period_start: 1_700_000_000,
          current_period_end: 1_800_000_000,
        }] },
      },
    },
  });
  const sendEvent = async (event) => {
    const payload = JSON.stringify(event);
    const { timestamp, value } = await stripeSignature(payload, secret);
    return worker.fetch(new Request('https://worker.test/stripe-webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${value}` },
      body: payload,
    }), env);
  };

  const activeEvent = makeEvent('evt_test_active', 'customer.subscription.updated', 'active');
  assert.equal((await sendEvent(activeEvent)).status, 200);
  assert.deepEqual(discordRoleCalls.at(-1), {
    path: '/api/v10/guilds/guild_test/members/discord_member/roles/role_test',
    method: 'PUT',
  });
  assert.equal(apiCallEvents.at(-1).code_commit, 'worker-version-test');
  assert.equal(apiCallEvents.at(-1).member_id, 'discord_member');
  assert.equal(apiCallEvents.at(-1).trigger_type, 'membership_entitlement_sync');
  assert.equal(subscriptionWrites.at(-1).cancel_at, '2027-01-15T08:00:00.000Z');
  assert.equal(subscriptionWrites.at(-1).current_period_start, '2023-11-14T22:13:20.000Z');
  assert.equal(subscriptionWrites.at(-1).current_period_end, '2027-01-15T08:00:00.000Z');
  const callsAfterFirstDelivery = discordRoleCalls.length;
  assert.match(await (await sendEvent(activeEvent)).text(), /duplicate/);
  assert.equal(discordRoleCalls.length, callsAfterFirstDelivery);

  const canceledEvent = makeEvent('evt_test_canceled', 'customer.subscription.deleted', 'canceled');
  assert.equal((await sendEvent(canceledEvent)).status, 200);
  assert.deepEqual(discordRoleCalls.at(-1), {
    path: '/api/v10/guilds/guild_test/members/discord_member/roles/role_test',
    method: 'DELETE',
  });
  assert.equal(apiCallEvents.at(-1).member_id, 'discord_member');
  assert.equal(apiCallEvents.at(-1).trigger_type, 'membership_entitlement_sync');
  assert.equal(webhookEvents.get('evt_test_active').status, 'PROCESSED');
  assert.equal(webhookEvents.get('evt_test_canceled').status, 'PROCESSED');
});

test('a retention discount webhook marks the Stripe customer once and records the redemption', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const webhookEvents = new Map();
  const membershipEvents = [];
  const customerUpdates = [];
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(url);
    const method = options.method || 'GET';
    if (requestUrl.hostname === 'api.stripe.com') {
      if (requestUrl.pathname === '/v1/customers/cus_retention' && method === 'GET') {
        return Response.json({ id: 'cus_retention', metadata: {} });
      }
      if (requestUrl.pathname === '/v1/customers/cus_retention' && method === 'POST') {
        customerUpdates.push({ body: new URLSearchParams(options.body), idempotencyKey: new Headers(options.headers).get('Idempotency-Key') });
        return Response.json({ id: 'cus_retention', metadata: { kbh_retention_offer_used: 'true' } });
      }
      throw new Error(`Unexpected Stripe request: ${method} ${requestUrl}`);
    }
    if (requestUrl.hostname === 'discord.com') return new Response(null, { status: 204 });
    assert.equal(requestUrl.hostname, 'project.supabase.test');
    const table = requestUrl.pathname.replace('/rest/v1/', '');
    if (table === 'api_call_events' && method === 'POST') return new Response(null, { status: 204 });
    if (table === 'stripe_webhook_events') {
      const eventId = requestUrl.searchParams.get('event_id')?.replace(/^eq\./, '');
      if (method === 'GET') return Response.json(webhookEvents.has(eventId) ? [webhookEvents.get(eventId)] : []);
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        webhookEvents.set(body.event_id, body);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        webhookEvents.set(eventId, { ...webhookEvents.get(eventId), ...JSON.parse(options.body) });
        return new Response(null, { status: 204 });
      }
    }
    if (table === 'membership_customers') {
      if (method === 'POST') return new Response(null, { status: 204 });
      return Response.json([{ discord_user_id: 'discord_retention' }]);
    }
    if (table === 'membership_subscriptions') {
      if (method === 'POST' || method === 'PATCH') return new Response(null, { status: 204 });
      return Response.json([{ entitlement_blocked: false }]);
    }
    if (table === 'membership_events' && method === 'POST') {
      membershipEvents.push(JSON.parse(options.body));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected Supabase request: ${method} ${requestUrl}`);
  };

  const secret = 'whsec_local_retention';
  const event = {
    id: 'evt_retention_applied',
    type: 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: {
      id: 'sub_retention',
      customer: 'cus_retention',
      status: 'active',
      created: 1_700_000_000,
      metadata: { discord_user_id: 'discord_retention' },
      discounts: [{ source: { type: 'coupon', coupon: 'coupon_retention' } }],
      items: { data: [{ price: { id: 'price_monthly' }, current_period_start: 1_700_000_000, current_period_end: 1_800_000_000 }] },
    } },
  };
  const payload = JSON.stringify(event);
  const { timestamp, value } = await stripeSignature(payload, secret);
  const response = await worker.fetch(new Request('https://worker.test/stripe-webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${value}` },
    body: payload,
  }), {
    STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    STRIPE_RETENTION_COUPON_ID: 'coupon_retention',
    SUPABASE_URL: 'https://project.supabase.test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    DISCORD_BOT_TOKEN: 'discord_bot_test',
    DISCORD_GUILD_ID: 'guild_test',
    DISCORD_MEMBER_ROLE_ID: 'role_test',
  });

  assert.equal(response.status, 200);
  assert.equal(customerUpdates.length, 1);
  assert.equal(customerUpdates[0].body.get('metadata[kbh_retention_offer_used]'), 'true');
  assert.equal(customerUpdates[0].body.get('metadata[kbh_retention_offer_coupon]'), 'coupon_retention');
  assert.equal(customerUpdates[0].idempotencyKey, 'kbh-retention-redemption-cus_retention-coupon_retention');
  assert.equal(membershipEvents.some((entry) => entry.event_type === 'RETENTION_OFFER_REDEEMED'), true);
});

test('billing exception webhooks durably block entitlement while failed payments keep status-based access', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const webhookEvents = new Map();
  const subscriptions = new Map();
  const membershipEvents = [];
  const discordRoleCalls = [];
  const subscriptionFixtures = new Map([
    ['sub_refund', { status: 'active', customer: 'cus_refund' }],
    ['sub_dispute', { status: 'active', customer: 'cus_dispute' }],
    ['sub_failed_active', { status: 'active', customer: 'cus_failed_active' }],
    ['sub_failed_past_due', { status: 'past_due', customer: 'cus_failed_past_due' }],
  ]);
  const customers = new Map([...subscriptionFixtures.entries()].map(([subscriptionId, fixture]) => [
    fixture.customer,
    { stripe_customer_id: fixture.customer, current_subscription_id: subscriptionId, discord_user_id: `discord_${subscriptionId}` },
  ]));
  const stripeSubscription = (subscriptionId) => {
    const fixture = subscriptionFixtures.get(subscriptionId);
    return {
      id: subscriptionId,
      customer: fixture.customer,
      status: fixture.status,
      created: 1_700_000_000,
      metadata: {},
      items: { data: [{ price: { id: 'price_test_monthly' }, current_period_start: 1_700_000_000, current_period_end: 1_800_000_000 }] },
    };
  };

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(url);
    const method = options.method || 'GET';
    if (requestUrl.hostname === 'api.stripe.com') {
      const path = requestUrl.pathname;
      if (path.startsWith('/v1/invoices/')) {
        const invoiceId = decodeURIComponent(path.split('/').at(-1));
        const subscriptionId = invoiceId.replace(/^in_/, 'sub_');
        return Response.json({ id: invoiceId, parent: { subscription_details: { subscription: subscriptionId } } });
      }
      if (path.startsWith('/v1/subscriptions/')) {
        return Response.json(stripeSubscription(decodeURIComponent(path.split('/').at(-1))));
      }
      if (path === '/v1/charges/ch_dispute') return Response.json({ id: 'ch_dispute', invoice: 'in_dispute' });
      throw new Error(`Unexpected Stripe request: ${method} ${path}`);
    }
    if (requestUrl.hostname === 'discord.com') {
      discordRoleCalls.push({ path: requestUrl.pathname, method });
      return new Response(null, { status: 204 });
    }
    assert.equal(requestUrl.hostname, 'project.supabase.test');
    const table = requestUrl.pathname.replace('/rest/v1/', '');
    if (table === 'api_call_events' && method === 'POST') return new Response(null, { status: 204 });
    if (table === 'stripe_webhook_events') {
      const eventId = requestUrl.searchParams.get('event_id')?.replace(/^eq\./, '');
      if (method === 'GET') return Response.json(webhookEvents.has(eventId) ? [webhookEvents.get(eventId)] : []);
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        webhookEvents.set(body.event_id, body);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        webhookEvents.set(eventId, { ...webhookEvents.get(eventId), ...JSON.parse(options.body) });
        return new Response(null, { status: 204 });
      }
    }
    if (table === 'membership_customers') {
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        customers.set(body.stripe_customer_id, { ...customers.get(body.stripe_customer_id), ...body });
        return new Response(null, { status: 204 });
      }
      const customerId = requestUrl.searchParams.get('stripe_customer_id')?.replace(/^eq\./, '');
      return Response.json(customerId && customers.has(customerId) ? [customers.get(customerId)] : []);
    }
    if (table === 'membership_subscriptions') {
      const subscriptionId = requestUrl.searchParams.get('stripe_subscription_id')?.replace(/^eq\./, '');
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        if (!subscriptions.has(body.stripe_subscription_id)) {
          subscriptions.set(body.stripe_subscription_id, {
            entitlement_blocked: false,
            entitlement_block_reason: null,
            ...body,
          });
        }
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        subscriptions.set(subscriptionId, { ...subscriptions.get(subscriptionId), ...JSON.parse(options.body) });
        return new Response(null, { status: 204 });
      }
      if (method === 'GET') return Response.json(subscriptionId && subscriptions.has(subscriptionId) ? [subscriptions.get(subscriptionId)] : []);
    }
    if (table === 'membership_events' && method === 'POST') {
      membershipEvents.push(JSON.parse(options.body));
      return new Response(null, { status: 204 });
    }
    if (table === 'referral_rewards' && method === 'GET') return Response.json([]);
    throw new Error(`Unexpected Supabase request: ${method} ${requestUrl}`);
  };

  const secret = 'whsec_local_billing_exceptions';
  const env = {
    STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_SECRET_KEY: 'sk_test_local_only',
    SUPABASE_URL: 'https://project.supabase.test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    DISCORD_BOT_TOKEN: 'discord_bot_test',
    DISCORD_GUILD_ID: 'guild_test',
    DISCORD_MEMBER_ROLE_ID: 'role_test',
  };
  const sendEvent = async (event) => {
    const payload = JSON.stringify({ created: Math.floor(Date.now() / 1000), livemode: false, ...event });
    const { timestamp, value } = await stripeSignature(payload, secret);
    return worker.fetch(new Request('https://worker.test/stripe-webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${value}` },
      body: payload,
    }), env);
  };

  assert.equal((await sendEvent({ id: 'evt_refund', type: 'charge.refunded', data: { object: { id: 'ch_refund', invoice: 'in_refund' } } })).status, 200);
  assert.equal(subscriptions.get('sub_refund').entitlement_blocked, true);
  assert.equal(subscriptions.get('sub_refund').entitlement_block_reason, 'CHARGE_REFUNDED');
  assert.deepEqual(discordRoleCalls.at(-1), {
    path: '/api/v10/guilds/guild_test/members/discord_sub_refund/roles/role_test',
    method: 'DELETE',
  });

  assert.equal((await sendEvent({ id: 'evt_active_after_refund', type: 'customer.subscription.updated', data: { object: stripeSubscription('sub_refund') } })).status, 200);
  assert.equal(discordRoleCalls.at(-1).method, 'DELETE');
  assert.equal(webhookEvents.get('evt_active_after_refund').outcome, 'ROLE_REMOVED_ENTITLEMENT_BLOCKED');

  assert.equal((await sendEvent({ id: 'evt_dispute', type: 'charge.dispute.created', data: { object: { id: 'dp_test', charge: 'ch_dispute' } } })).status, 200);
  assert.equal(subscriptions.get('sub_dispute').entitlement_blocked, true);
  assert.equal(subscriptions.get('sub_dispute').entitlement_block_reason, 'CHARGE_DISPUTED');

  assert.equal((await sendEvent({ id: 'evt_failed_active', type: 'invoice.payment_failed', data: { object: { id: 'in_failed_active', subscription: 'sub_failed_active' } } })).status, 200);
  assert.equal(subscriptions.get('sub_failed_active').entitlement_blocked, false);
  assert.equal(discordRoleCalls.at(-1).method, 'PUT');
  assert.equal(webhookEvents.get('evt_failed_active').outcome, 'PAYMENT_FAILED_ROLE_GRANTED');

  assert.equal((await sendEvent({ id: 'evt_failed_past_due', type: 'invoice.payment_failed', data: { object: { id: 'in_failed_past_due', subscription: 'sub_failed_past_due' } } })).status, 200);
  assert.equal(subscriptions.get('sub_failed_past_due').entitlement_blocked, false);
  assert.equal(discordRoleCalls.at(-1).method, 'DELETE');
  assert.equal(webhookEvents.get('evt_failed_past_due').outcome, 'PAYMENT_FAILED_ROLE_REMOVED');

  subscriptionFixtures.get('sub_failed_past_due').status = 'active';
  assert.equal((await sendEvent({
    id: 'evt_failed_recovered',
    type: 'customer.subscription.updated',
    data: { object: stripeSubscription('sub_failed_past_due') },
  })).status, 200);
  assert.equal(discordRoleCalls.at(-1).method, 'PUT');
  assert.equal(webhookEvents.get('evt_failed_recovered').outcome, 'ROLE_GRANTED');

  assert.equal(membershipEvents.filter((event) => event.event_type === 'MEMBERSHIP_ENTITLEMENT_BLOCKED').length, 2);
  assert.equal(membershipEvents.filter((event) => event.event_type === 'MEMBERSHIP_PAYMENT_FAILED').length, 2);
});
