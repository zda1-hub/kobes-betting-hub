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
  assert.deepEqual(await response.json(), { ok: true });
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

test('checkout worker exposes a scheduled membership reconciliation handler', () => {
  assert.equal(typeof worker.scheduled, 'function');
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
  assert.equal(trialForm.get('line_items[0][price]'), 'price_monthly');
  assert.equal(trialForm.has('line_items[1][price]'), false);
  assert.equal(trialForm.get('subscription_data[trial_period_days]'), '2');
  assert.equal(trialForm.get('payment_method_collection'), 'always');
  assert.equal(requests[0].headers.get('Idempotency-Key'), 'fa8b14dd-1c67-4cbe-8308-52a750d0e534');
  assert.equal(requests[1].headers.get('Idempotency-Key'), 'f054a06e-a74b-439f-a56d-b0be5f6cc613');
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
    if (['membership_customers', 'membership_subscriptions'].includes(table) && method === 'POST') {
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
        metadata: { discord_user_id: 'discord_member' },
        items: { data: [{ price: { id: 'price_test_monthly' } }] },
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
  const callsAfterFirstDelivery = discordRoleCalls.length;
  assert.match(await (await sendEvent(activeEvent)).text(), /duplicate/);
  assert.equal(discordRoleCalls.length, callsAfterFirstDelivery);

  const canceledEvent = makeEvent('evt_test_canceled', 'customer.subscription.deleted', 'canceled');
  assert.equal((await sendEvent(canceledEvent)).status, 200);
  assert.deepEqual(discordRoleCalls.at(-1), {
    path: '/api/v10/guilds/guild_test/members/discord_member/roles/role_test',
    method: 'DELETE',
  });
  assert.equal(webhookEvents.get('evt_test_active').status, 'PROCESSED');
  assert.equal(webhookEvents.get('evt_test_canceled').status, 'PROCESSED');
});
