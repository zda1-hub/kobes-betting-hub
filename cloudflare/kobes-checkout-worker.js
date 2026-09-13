/**
 * Kobe's Betting Hub checkout service.
 *
 * Required Cloudflare Worker secrets:
 *   STRIPE_SECRET_KEY          Stripe restricted key (rk_live_...)
 *   STRIPE_WEBHOOK_SECRET      Stripe webhook signing secret (whsec_...)
 *   DISCORD_CLIENT_SECRET      Discord OAuth application client secret
 *   DISCORD_BOT_TOKEN          Discord bot token (Manage Roles permission required)
 *   DISCORD_OAUTH_STATE_SECRET Random secret used to secure OAuth state
 *   SUPABASE_SECRET_KEY        Server-only sb_secret key; never expose it to the website
 *
 * Required Worker variables:
 *   STRIPE_MONTHLY_PRICE_ID    $32.99/month recurring Stripe Price ID
 *   STRIPE_STARTER_PRICE_ID    $10 one-time first-week-access Stripe Price ID
 *   DISCORD_CLIENT_ID          Discord OAuth application client ID
 *   DISCORD_GUILD_ID           Kobe's Discord server ID
 *   DISCORD_MEMBER_ROLE_ID     Paid-member role ID
 *   DISCORD_REDIRECT_URI       Worker callback URL registered in Discord
 *   SUPABASE_URL               Existing Kobe's Betting Hub Supabase project URL
 */

const SITE_ORIGIN = 'https://kobesbettinghub.com';
const SITE_PATH = '';
const ALLOWED_SITE_ORIGINS = new Set([
  SITE_ORIGIN,
  'https://www.kobesbettinghub.com',
  'https://zda1-hub.github.io',
]);
const STRIPE_API = 'https://api.stripe.com/v1';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

const headers = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_SITE_ORIGINS.has(origin) ? origin : SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Checkout-Request-Id',
  Vary: 'Origin',
  'Content-Type': 'application/json; charset=utf-8',
});

const json = (body, status = 200, origin) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
const form = (data) => new URLSearchParams(Object.entries(data).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]));

const sanitizedEndpoint = (path) => String(path || '/')
  .replace(/\/(?:cs|sub|cus|bps|in|evt)_(?:live|test_)?[A-Za-z0-9_]+/g, '/{id}')
  .replace(/\/\d{6,}(?=\/|$)/g, '/{id}');

async function sha256Text(value) {
  if (value === undefined || value === null) return null;
  return toHex(await crypto.subtle.digest('SHA-256', encode.encode(String(value))));
}

async function auditExternalCall(env, values) {
  if (!supabaseReady(env)) return;
  const key = supabaseKey(env);
  try {
    await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/api_call_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        environment: env.APP_ENV || 'production',
        operation_id: values.operationId || null,
        workflow_id: values.workflowId || null,
        pick_id: null,
        member_id: values.memberId || null,
        service: values.service,
        endpoint_class: sanitizedEndpoint(values.endpointClass),
        method: values.method || 'GET',
        caller_component: 'cloudflare/kobes-checkout-worker',
        trigger_type: values.triggerType || 'membership_request',
        provider_request_id: values.providerRequestId || null,
        client_request_id: values.clientRequestId || null,
        request_payload_sha256: values.requestPayloadSha256 || null,
        response_payload_sha256: values.responsePayloadSha256 || null,
        response_status: values.responseStatus ?? null,
        outcome: values.outcome,
        error_class: values.errorClass || null,
        retry_count: 0,
        latency_ms: values.latencyMs ?? null,
        code_commit: env.CF_VERSION_METADATA?.id || env.WORKER_VERSION || null,
        occurred_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('Unable to persist outbound API audit event.', error?.message || error);
  }
}

async function stripe(env, path, values, { idempotencyKey, clientRequestId } = {}) {
  const body = values ? form(values) : undefined;
  const operationId = crypto.randomUUID();
  const startedAt = Date.now();
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body,
  });
  const responseText = await response.text();
  const result = JSON.parse(responseText);
  await auditExternalCall(env, {
    service: 'stripe', endpointClass: path, method: 'POST', operationId,
    providerRequestId: response.headers.get('request-id'),
    clientRequestId,
    requestPayloadSha256: await sha256Text(body?.toString()),
    responsePayloadSha256: await sha256Text(responseText), responseStatus: response.status,
    outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: response.ok ? null : 'HTTP_ERROR',
    latencyMs: Date.now() - startedAt,
  });
  if (!response.ok) throw new Error(result.error?.message || 'Stripe request failed.');
  return result;
}

async function stripeGet(env, path) {
  const operationId = crypto.randomUUID();
  const startedAt = Date.now();
  const response = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const responseText = await response.text();
  const result = JSON.parse(responseText);
  await auditExternalCall(env, {
    service: 'stripe', endpointClass: path, method: 'GET', operationId,
    providerRequestId: response.headers.get('request-id'),
    responsePayloadSha256: await sha256Text(responseText), responseStatus: response.status,
    outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: response.ok ? null : 'HTTP_ERROR',
    latencyMs: Date.now() - startedAt,
  });
  if (!response.ok) throw new Error(result.error?.message || 'Stripe request failed.');
  return result;
}

function supabaseKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function supabaseReady(env) {
  return Boolean(env.SUPABASE_URL && supabaseKey(env));
}

async function supabase(env, path, { method = 'GET', body, prefer } = {}) {
  if (!supabaseReady(env)) throw new Error('Membership persistence is not configured.');
  const key = supabaseKey(env);
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.message || ''; } catch { /* no readable error body */ }
    throw new Error(`Membership database request failed (${response.status})${detail ? `: ${detail}` : '.'}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const stripeId = (value) => (typeof value === 'string' ? value : value?.id || '');
const stripeTimestamp = (value) => (Number.isFinite(value) ? new Date(value * 1000).toISOString() : null);

async function persistCustomer(env, customerId, fields = {}) {
  if (!customerId) return;
  const now = new Date().toISOString();
  const body = {
    stripe_customer_id: customerId,
    updated_at: now,
  };
  if (fields.discordUserId) {
    body.discord_user_id = fields.discordUserId;
    body.linked_at = now;
  }
  if (fields.subscriptionId) body.current_subscription_id = fields.subscriptionId;
  await supabase(env, 'membership_customers?on_conflict=stripe_customer_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body,
  });
}

async function persistSubscription(env, subscription, eventId = null) {
  const customerId = stripeId(subscription?.customer);
  if (!subscription?.id || !customerId) return;
  const now = new Date().toISOString();
  const item = subscription.items?.data?.[0];
  await persistCustomer(env, customerId, { subscriptionId: subscription.id });
  await supabase(env, 'membership_subscriptions?on_conflict=stripe_subscription_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      status: subscription.status || 'unknown',
      price_id: stripeId(item?.price),
      offer: subscription.metadata?.offer || null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      current_period_start: stripeTimestamp(subscription.current_period_start),
      current_period_end: stripeTimestamp(subscription.current_period_end),
      trial_end: stripeTimestamp(subscription.trial_end),
      last_stripe_event_id: eventId,
      raw_metadata: subscription.metadata || {},
      created_at: stripeTimestamp(subscription.created) || now,
      updated_at: now,
    },
  });
}

async function membershipCustomerForDiscord(env, discordUserId) {
  const rows = await supabase(env, `membership_customers?discord_user_id=eq.${encodeURIComponent(discordUserId)}&select=stripe_customer_id,current_subscription_id&limit=1`);
  return rows?.[0] || null;
}

async function membershipCustomerForStripe(env, customerId) {
  const rows = await supabase(env, `membership_customers?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=stripe_customer_id,discord_user_id,current_subscription_id&limit=1`);
  return rows?.[0] || null;
}

async function claimDiscordLink(env, customerId, subscriptionId, discordUserId) {
  if (!customerId || !subscriptionId || !discordUserId) throw new Error('The membership connection request is incomplete.');

  // Ensure the checkout customer exists, but never overwrite an established
  // Discord link as part of this preparatory upsert.
  await persistCustomer(env, customerId, { subscriptionId });

  const existingCustomer = await membershipCustomerForStripe(env, customerId);
  if (existingCustomer?.discord_user_id && existingCustomer.discord_user_id !== discordUserId) {
    throw new Error('This membership is already connected to another Discord account. Contact support to change it.');
  }

  const existingDiscordLink = await membershipCustomerForDiscord(env, discordUserId);
  if (existingDiscordLink?.stripe_customer_id && existingDiscordLink.stripe_customer_id !== customerId) {
    throw new Error('This Discord account is already connected to another membership. Contact support for help.');
  }
  if (existingCustomer?.discord_user_id === discordUserId) return existingCustomer;

  const now = new Date().toISOString();
  let claimed;
  try {
    claimed = await supabase(env, `membership_customers?stripe_customer_id=eq.${encodeURIComponent(customerId)}&discord_user_id=is.null`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        discord_user_id: discordUserId,
        current_subscription_id: subscriptionId,
        linked_at: now,
        updated_at: now,
      },
    });
  } catch (error) {
    // A unique-key conflict means this Discord identity was claimed elsewhere.
    // Keep the public error generic instead of returning database details.
    throw new Error('This Discord account could not be connected safely. Contact support for help.');
  }
  if (claimed?.[0]?.discord_user_id === discordUserId) return claimed[0];

  // Another callback may have won the conditional claim between the reads and
  // PATCH. Accept an idempotent retry, but fail closed for a different account.
  const winner = await membershipCustomerForStripe(env, customerId);
  if (winner?.discord_user_id === discordUserId) return winner;
  throw new Error('This membership is already connected to another Discord account. Contact support to change it.');
}

async function discordUserForSubscription(env, subscription) {
  if (subscription?.metadata?.discord_user_id) return subscription.metadata.discord_user_id;
  const customerId = stripeId(subscription?.customer);
  if (!customerId || !supabaseReady(env)) return '';
  const rows = await supabase(env, `membership_customers?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=discord_user_id&limit=1`);
  return rows?.[0]?.discord_user_id || '';
}

async function recordMembershipEvent(env, values) {
  if (!supabaseReady(env)) return;
  await supabase(env, 'membership_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id: crypto.randomUUID(),
      event_type: values.eventType,
      actor_type: values.actorType,
      actor_id: values.actorId || null,
      stripe_customer_id: values.customerId || null,
      stripe_subscription_id: values.subscriptionId || null,
      discord_user_id: values.discordUserId || null,
      details: values.details || {},
      occurred_at: new Date().toISOString(),
    },
  });
}

async function beginWebhookEvent(env, event, payload) {
  const existing = await supabase(env, `stripe_webhook_events?event_id=eq.${encodeURIComponent(event.id)}&select=status&limit=1`);
  if (existing?.[0]?.status === 'PROCESSED') return false;
  if (!existing?.length) {
    const digest = await crypto.subtle.digest('SHA-256', encode.encode(payload));
    await supabase(env, 'stripe_webhook_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        event_id: event.id,
        event_type: event.type,
        stripe_created_at: stripeTimestamp(event.created),
        livemode: Boolean(event.livemode),
        payload_sha256: toHex(digest),
        status: 'RECEIVED',
        received_at: new Date().toISOString(),
      },
    });
  }
  return true;
}

async function finishWebhookEvent(env, eventId, status, outcome, errorDetail = null) {
  await supabase(env, `stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      status,
      outcome,
      error_detail: errorDetail ? String(errorDetail).slice(0, 500) : null,
      processed_at: new Date().toISOString(),
    },
  });
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const toHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const encode = new TextEncoder();
const decode = new TextDecoder();

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function secureEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function verifyStripeSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const parts = signature.split(',').map((piece) => {
    const separator = piece.indexOf('=');
    return separator === -1 ? ['', ''] : [piece.slice(0, separator).trim(), piece.slice(separator + 1).trim()];
  });
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const digest = await crypto.subtle.sign('HMAC', await signingKey(secret), new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = toHex(digest);
  return signatures.some((candidate) => secureEqual(expected, candidate));
}

async function sign(value, secret) {
  const digest = await crypto.subtle.sign('HMAC', await signingKey(secret), encode.encode(value));
  return toHex(digest);
}

function discordReady(env) {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN && env.DISCORD_OAUTH_STATE_SECRET && env.DISCORD_GUILD_ID && env.DISCORD_MEMBER_ROLE_ID && env.DISCORD_REDIRECT_URI);
}

async function createDiscordState({ sessionId = null, intent = 'connect' }, env) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const body = toBase64Url(encode.encode(JSON.stringify({ sessionId, intent, expiresAt: Math.floor(Date.now() / 1000) + 600, nonce: toBase64Url(bytes) })));
  return `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
}

async function readDiscordState(state, env) {
  const [body, signature, ...extra] = state.split('.');
  if (!body || !signature || extra.length || !secureEqual(await sign(body, env.DISCORD_OAUTH_STATE_SECRET), signature)) throw new Error('Invalid Discord connection request.');
  const value = JSON.parse(decode.decode(fromBase64Url(body)));
  if (!['connect', 'portal'].includes(value.intent) || value.expiresAt < Math.floor(Date.now() / 1000)) throw new Error('That Discord authorization link expired. Please try again.');
  if (value.intent === 'connect' && !value.sessionId) throw new Error('That Discord connection request is incomplete.');
  return value;
}

async function activeSubscription(sessionId, env) {
  if (!/^cs_(live|test)_/.test(sessionId)) throw new Error('Invalid checkout session.');
  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status) || !session.subscription) throw new Error('Complete checkout before connecting Discord.');
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(session.subscription)}`);
  if (!['active', 'trialing'].includes(subscription.status)) throw new Error('Your membership is not active.');
  return subscription;
}

async function subscriptionForCancellation(sessionId, env) {
  const subscription = await activeSubscription(sessionId, env);
  if (subscription.cancel_at_period_end) throw new Error('This membership is already scheduled to cancel.');
  return subscription;
}

async function cancellationOffer(request, env, origin) {
  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  try {
    const subscription = await subscriptionForCancellation(sessionId, env);
    return json({ retentionAvailable: !subscription.metadata?.retention_offer_used, status: subscription.status }, 200, origin);
  } catch (error) { return json({ error: error.message }, 403, origin); }
}

async function retainMembership(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  const percent = Number(data.percent);
  const coupon = percent === 20 ? env.STRIPE_RETENTION_20_COUPON_ID : percent === 40 ? env.STRIPE_RETENTION_40_COUPON_ID : '';
  if (!coupon) return json({ error: 'This retention offer is not configured yet.' }, 503, origin);
  try {
    const subscription = await subscriptionForCancellation(data.session_id || '', env);
    if (subscription.metadata?.retention_offer_used) return json({ error: 'The one-time retention offer has already been used.' }, 409, origin);
    const updated = await stripe(env, `/subscriptions/${encodeURIComponent(subscription.id)}`, {
      'discounts[0][coupon]': coupon,
      'metadata[retention_offer_used]': 'true',
      'metadata[retention_offer_percent]': percent,
      'metadata[retention_offer_redeemed_at]': new Date().toISOString(),
    });
    return json({ ok: true, percent, status: updated.status }, 200, origin);
  } catch (error) { return json({ error: error.message }, 403, origin); }
}

async function confirmCancellation(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  try {
    const subscription = await subscriptionForCancellation(data.session_id || '', env);
    const updated = await stripe(env, `/subscriptions/${encodeURIComponent(subscription.id)}`, { cancel_at_period_end: 'true' });
    return json({ ok: true, ends_at: updated.current_period_end }, 200, origin);
  } catch (error) { return json({ error: error.message }, 403, origin); }
}

async function discordRequest(path, options = {}, env) {
  const operationId = crypto.randomUUID();
  const startedAt = Date.now();
  const response = await fetch(`https://discord.com/api/v10${path}`, options);
  await auditExternalCall(env, {
    service: 'discord', endpointClass: `/api/v10${path}`, method: options.method || 'GET', operationId,
    providerRequestId: response.headers.get('x-request-id'),
    requestPayloadSha256: await sha256Text(options.body), responseStatus: response.status,
    outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: response.ok ? null : 'HTTP_ERROR',
    latencyMs: Date.now() - startedAt,
  });
  if (!response.ok) throw new Error('Discord could not complete the connection.');
  return response.status === 204 ? null : response.json();
}

async function removeMemberRole(subscription, env) {
  const memberId = await discordUserForSubscription(env, subscription);
  if (!memberId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_MEMBER_ROLE_ID) return;
  await discordRequest(
    `/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}/roles/${env.DISCORD_MEMBER_ROLE_ID}`,
    { method: 'DELETE', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }, env,
  );
}

async function grantMemberRole(memberId, env) {
  if (!memberId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_MEMBER_ROLE_ID) return;
  await discordRequest(
    `/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}/roles/${env.DISCORD_MEMBER_ROLE_ID}`,
    { method: 'PUT', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }, env,
  );
}

async function syncMemberRole(subscription, env) {
  const memberId = await discordUserForSubscription(env, subscription);
  if (!memberId) return 'NO_DISCORD_LINK';
  if (ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    await grantMemberRole(memberId, env);
    return 'ROLE_GRANTED';
  }
  await removeMemberRole(subscription, env);
  return 'ROLE_REMOVED';
}

async function reconcileMemberships(env) {
  if (!supabaseReady(env) || !env.STRIPE_SECRET_KEY) {
    throw new Error('Membership reconciliation requires Supabase and Stripe configuration.');
  }
  const rows = await supabase(env, 'membership_subscriptions?select=stripe_subscription_id&order=updated_at.asc&limit=500');
  const summary = { checked: 0, rolesGranted: 0, rolesRemoved: 0, noDiscordLink: 0, failed: 0 };
  for (const row of rows || []) {
    const subscriptionId = row?.stripe_subscription_id || '';
    if (!subscriptionId) continue;
    summary.checked += 1;
    try {
      const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      await persistSubscription(env, subscription);
      const outcome = await syncMemberRole(subscription, env);
      if (outcome === 'ROLE_GRANTED') summary.rolesGranted += 1;
      else if (outcome === 'ROLE_REMOVED') summary.rolesRemoved += 1;
      else summary.noDiscordLink += 1;
      await recordMembershipEvent(env, {
        eventType: 'MEMBERSHIP_RECONCILED', actorType: 'system', subscriptionId,
        customerId: stripeId(subscription.customer), discordUserId: await discordUserForSubscription(env, subscription),
        details: { status: subscription.status, outcome },
      });
    } catch (error) {
      summary.failed += 1;
      console.error('Membership reconciliation failed.', { subscriptionId, message: error?.message || error });
      try {
        await recordMembershipEvent(env, {
          eventType: 'MEMBERSHIP_RECONCILIATION_FAILED', actorType: 'system', subscriptionId,
          details: { error: String(error?.message || error).slice(0, 300) },
        });
      } catch (auditError) {
        console.error('Unable to record membership reconciliation failure.', auditError?.message || auditError);
      }
    }
  }
  console.log('Membership reconciliation completed.', summary);
  return summary;
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

async function startDiscordConnection(request, env) {
  if (!discordReady(env)) return new Response('Discord connection is being configured. Please check back shortly.', { status: 503 });
  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  try { await activeSubscription(sessionId, env); }
  catch (error) { return new Response(error.message, { status: 403 }); }

  const state = await createDiscordState({ sessionId, intent: 'connect' }, env);
  return redirect(discordAuthorizationUrl(state, env, 'connect'));
}

function discordAuthorizationUrl(state, env, intent) {
  const authorization = new URL('https://discord.com/oauth2/authorize');
  authorization.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.DISCORD_REDIRECT_URI,
    scope: intent === 'portal' ? 'identify' : 'identify guilds.join',
    state,
    prompt: 'consent',
  }).toString();
  return authorization.toString();
}

async function startPortalLogin(request, env) {
  if (!discordReady(env) || !supabaseReady(env)) return new Response('Membership management is being configured. Please check back shortly.', { status: 503 });
  const intent = new URL(request.url).searchParams.get('intent');
  if (intent !== 'portal') return new Response('Invalid membership-management request.', { status: 400 });
  const state = await createDiscordState({ intent: 'portal' }, env);
  return redirect(discordAuthorizationUrl(state, env, 'portal'));
}

async function finishDiscordConnection(request, env) {
  if (!discordReady(env)) return new Response('Discord connection is being configured. Please check back shortly.', { status: 503 });
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || !returnedState) return new Response('Discord did not complete the connection.', { status: 400 });

  let discordAccessToken = '';
  try {
    const state = await readDiscordState(returnedState, env);
    const tokenStartedAt = Date.now();
    const tokenBody = form({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: env.DISCORD_REDIRECT_URI });
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    const tokenText = await tokenResponse.text();
    const token = JSON.parse(tokenText);
    await auditExternalCall(env, {
      service: 'discord', endpointClass: '/api/oauth2/token', method: 'POST',
      requestPayloadSha256: await sha256Text(tokenBody.toString()),
      responsePayloadSha256: await sha256Text(tokenText), responseStatus: tokenResponse.status,
      outcome: tokenResponse.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: tokenResponse.ok ? null : 'HTTP_ERROR',
      latencyMs: Date.now() - tokenStartedAt,
    });
    if (!tokenResponse.ok || !token.access_token) throw new Error('Discord authorization failed.');
    discordAccessToken = token.access_token;
    const user = await discordRequest('/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } }, env);
    if (state.intent === 'portal') {
      const membership = await membershipCustomerForDiscord(env, user.id);
      if (!membership?.stripe_customer_id) throw new Error('No paid membership is linked to this Discord account. Connect Discord from the checkout confirmation first.');
      const portal = await stripe(env, '/billing_portal/sessions', {
        customer: membership.stripe_customer_id,
        return_url: `${SITE_ORIGIN}${SITE_PATH}/cancel.html?portal=returned`,
      });
      await recordMembershipEvent(env, {
        eventType: 'BILLING_PORTAL_OPENED', actorType: 'discord_user', actorId: user.id,
        customerId: membership.stripe_customer_id, subscriptionId: membership.current_subscription_id,
        discordUserId: user.id,
      });
      return redirect(portal.url);
    }

    const subscription = await activeSubscription(state.sessionId, env);
    const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(state.sessionId)}`);
    const customerId = stripeId(session.customer) || stripeId(subscription.customer);
    const botHeaders = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    if (!supabaseReady(env)) throw new Error('Membership persistence is not configured.');
    await claimDiscordLink(env, customerId, subscription.id, user.id);
    await stripe(env, `/subscriptions/${encodeURIComponent(subscription.id)}`, {
      'metadata[discord_user_id]': user.id,
      'metadata[discord_connected_at]': new Date().toISOString(),
    });
    await persistSubscription(env, { ...subscription, metadata: { ...(subscription.metadata || {}), discord_user_id: user.id } });
    await recordMembershipEvent(env, {
      eventType: 'DISCORD_ACCOUNT_LINKED', actorType: 'discord_user', actorId: user.id,
      customerId,
      subscriptionId: subscription.id, discordUserId: user.id,
    });
    await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, { method: 'PUT', headers: botHeaders, body: JSON.stringify({ access_token: token.access_token }) }, env);
    await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, { method: 'PUT', headers: botHeaders }, env);
    return redirect(`${SITE_ORIGIN}${SITE_PATH}/membership.html?checkout=connected`);
  } catch (error) {
    return new Response(error.message || 'Discord connection failed.', { status: 400 });
  } finally {
    if (discordAccessToken) {
      try {
        const revokeStartedAt = Date.now();
        const revokeBody = form({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, token: discordAccessToken, token_type_hint: 'access_token' });
        const revokeResponse = await fetch('https://discord.com/api/oauth2/token/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: revokeBody,
        });
        await auditExternalCall(env, {
          service: 'discord', endpointClass: '/api/oauth2/token/revoke', method: 'POST',
          requestPayloadSha256: await sha256Text(revokeBody.toString()), responseStatus: revokeResponse.status,
          outcome: revokeResponse.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: revokeResponse.ok ? null : 'HTTP_ERROR',
          latencyMs: Date.now() - revokeStartedAt,
        });
      } catch { /* The short-lived token expires even if best-effort revocation fails. */ }
    }
  }
}

async function createCheckout(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  if (!['starter', 'trial_2_day'].includes(data.offer)) return json({ error: 'Choose an available membership offer.' }, 400, origin);
  const suppliedRequestId = request.headers.get('X-Checkout-Request-Id');
  if (suppliedRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedRequestId)) {
    return json({ error: 'Invalid checkout request ID.' }, 400, origin);
  }
  const requestId = suppliedRequestId?.toLowerCase() || crypto.randomUUID();
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_MONTHLY_PRICE_ID || (data.offer === 'starter' && !env.STRIPE_STARTER_PRICE_ID)) {
    return json({ error: 'Checkout is being finalized. Please try again shortly.' }, 503, origin);
  }

  const membershipPage = `${SITE_ORIGIN}${SITE_PATH}/membership.html`;
  const values = {
    mode: 'subscription',
    success_url: `${membershipPage}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${membershipPage}?checkout=cancel`,
    payment_method_collection: 'always',
    'payment_method_types[0]': 'card',
    billing_address_collection: 'auto',
    'line_items[0][price]': env.STRIPE_MONTHLY_PRICE_ID,
    'line_items[0][quantity]': 1,
    'metadata[offer]': data.offer,
    'subscription_data[metadata][offer]': data.offer,
    'subscription_data[trial_period_days]': data.offer === 'starter' ? 7 : 2,
    'subscription_data[trial_settings][end_behavior][missing_payment_method]': 'cancel',
  };
  if (data.offer === 'starter') {
    values['line_items[1][price]'] = env.STRIPE_STARTER_PRICE_ID;
    values['line_items[1][quantity]'] = 1;
  }
  try {
    const session = await stripe(env, '/checkout/sessions', values, {
      idempotencyKey: requestId,
      clientRequestId: requestId,
    });
    return json({ url: session.url }, 200, origin);
  } catch (error) {
    return json({ error: error.message }, 502, origin);
  }
}

async function handleWebhook(request, env) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 1_000_000) return new Response('Webhook payload is too large.', { status: 413 });
  const payload = await request.text();
  const valid = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid Stripe signature.', { status: 400 });
  if (!supabaseReady(env)) return new Response('Membership persistence is not configured.', { status: 503 });
  try {
    const event = JSON.parse(payload);
    if (!await beginWebhookEvent(env, event, payload)) return new Response('ok: duplicate', { status: 200 });
    let outcome = 'RECORDED';
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      await persistCustomer(env, stripeId(session?.customer), { subscriptionId: stripeId(session?.subscription) });
      outcome = 'CHECKOUT_RECORDED';
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      const subscription = event.data?.object;
      await persistSubscription(env, subscription, event.id);
      outcome = await syncMemberRole(subscription, env);
    }
    await finishWebhookEvent(env, event.id, 'PROCESSED', outcome);
    return new Response('ok', { status: 200 });
  } catch (error) {
    let eventId = '';
    try { eventId = JSON.parse(payload)?.id || ''; } catch { /* invalid JSON */ }
    try { if (eventId) await finishWebhookEvent(env, eventId, 'FAILED', 'PROCESSING_FAILED', error.message); } catch { /* Stripe retry remains authoritative */ }
    return new Response(`Webhook processing failed: ${error.message}`, { status: 500 });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true }, 200, origin);
    if (request.method === 'GET' && url.pathname === '/cancel/offer') return json({ error: 'Use Discord login and Stripe Customer Portal.' }, 410, origin);
    if (request.method === 'GET' && url.pathname === '/discord/connect') return startDiscordConnection(request, env);
    if (request.method === 'GET' && url.pathname === '/discord/login') return startPortalLogin(request, env);
    if (request.method === 'GET' && url.pathname === '/discord/callback') return finishDiscordConnection(request, env);
    if (request.method === 'POST' && url.pathname === '/create-checkout') return createCheckout(request, env, origin);
    if (request.method === 'POST' && ['/cancel/retain', '/cancel/confirm'].includes(url.pathname)) return json({ error: 'Use Discord login and Stripe Customer Portal.' }, 410, origin);
    if (request.method === 'POST' && url.pathname === '/stripe-webhook') return handleWebhook(request, env);
    return json({ error: 'Not found.' }, 404, origin);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(reconcileMemberships(env));
  },
};

export const __test = {
  claimDiscordLink,
  createDiscordState,
  discordAuthorizationUrl,
  readDiscordState,
  verifyStripeSignature,
};
