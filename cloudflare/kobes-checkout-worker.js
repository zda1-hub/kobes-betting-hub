/**
 * Kobe's Betting Hub checkout service.
 *
 * Required Cloudflare Worker secrets:
 *   STRIPE_SECRET_KEY          Stripe restricted key (rk_live_...)
 *   STRIPE_WEBHOOK_SECRET      Stripe webhook signing secret (whsec_...)
 *   STRIPE_GLOBAL_PAYOUTS_KEY  Restricted key for Global Payouts API v2
 *   DISCORD_CLIENT_SECRET      Discord OAuth application client secret
 *   DISCORD_BOT_TOKEN          Discord bot token (Manage Roles permission required)
 *   DISCORD_OAUTH_STATE_SECRET Random secret used to secure OAuth state
 *   SUPABASE_SECRET_KEY        Server-only sb_secret key; never expose it to the website
 *   MEMBERSHIP_OPERATIONS_SECRET Dedicated bearer secret for manual reconciliation
 *
 * Required Worker variables:
 *   STRIPE_MONTHLY_PRICE_ID    $32.99/month recurring Stripe Price ID
 *   STRIPE_STARTER_PRICE_ID    $10 one-time first-week-access Stripe Price ID
 *   DISCORD_CLIENT_ID          Discord OAuth application client ID
 *   DISCORD_GUILD_ID           Kobe's Discord server ID
 *   DISCORD_MEMBER_ROLE_ID     Paid-member role ID
 *   DISCORD_REDIRECT_URI       Worker callback URL registered in Discord
 *   SUPABASE_URL               Existing Kobe's Betting Hub Supabase project URL
 *   SITE_ORIGIN                Required non-production site origin when APP_ENV=staging
 *
 * Required Worker binding:
 *   CHECKOUT_RATE_LIMITER      Per-client create-checkout limiter (10 attempts/minute)
 */

const SITE_ORIGIN = 'https://kobesbettinghub.com';
const SITE_PATH = '';
const STAGING_SITE_ORIGIN = 'https://kobes-betting-hub-staging.kobedirwin.workers.dev';
const ALLOWED_SITE_ORIGINS = new Set([
  SITE_ORIGIN,
  STAGING_SITE_ORIGIN,
  'https://www.kobesbettinghub.com',
  'https://zda1-hub.github.io',
]);
const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_API_V2 = 'https://api.stripe.com/v2';
const STRIPE_V2_VERSION = '2026-08-26.preview';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const REFERRAL_REWARD_CENTS = 1000;
const REFERRAL_HOLD_DAYS = 7;
const RETENTION_USED_METADATA_KEY = 'kbh_retention_offer_used';
const RETENTION_COUPON_METADATA_KEY = 'kbh_retention_offer_coupon';

const headers = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_SITE_ORIGINS.has(origin) ? origin : SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Checkout-Request-Id',
  Vary: 'Origin',
  'Content-Type': 'application/json; charset=utf-8',
});

const json = (body, status = 200, origin) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
const form = (data) => new URLSearchParams(Object.entries(data).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]));

async function checkoutRateLimitResponse(request, env, origin) {
  if (!env.CHECKOUT_RATE_LIMITER?.limit) return null;
  // Checkout has no authenticated user yet. A hash of network and client hints
  // avoids retaining the raw values while a generous limit minimizes shared-IP
  // false positives. Stripe idempotency remains the duplicate-charge control.
  const actor = [
    request.headers.get('cf-connecting-ip') || 'unknown-network',
    request.headers.get('user-agent') || 'unknown-client',
  ].join('|');
  try {
    const { success } = await env.CHECKOUT_RATE_LIMITER.limit({ key: `create-checkout:${await sha256Text(actor)}` });
    if (success) return null;
    return new Response(JSON.stringify({ error: 'Too many checkout attempts. Please wait one minute and try again.' }), {
      status: 429,
      headers: { ...headers(origin), 'Retry-After': '60' },
    });
  } catch (error) {
    console.error('Checkout rate limiter unavailable; Stripe idempotency remains active.', error?.message || error);
    return null;
  }
}

function siteOrigin(env) {
  if (env?.APP_ENV !== 'staging') return SITE_ORIGIN;
  const configured = String(env?.SITE_ORIGIN || '').replace(/\/$/, '');
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || parsed.origin !== configured || !ALLOWED_SITE_ORIGINS.has(configured) || configured === SITE_ORIGIN) {
      throw new Error('invalid');
    }
    return configured;
  } catch {
    throw new Error('Staging site origin is not configured safely.');
  }
}

const sanitizedEndpoint = (path) => String(path || '/').split('?', 1)[0]
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
  const response = await fetch(`${STRIPE_API}${path}`, { signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
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

async function stripeV2(env, path, { method = 'GET', body, idempotencyKey, stripeContext } = {}) {
  if (!env.STRIPE_GLOBAL_PAYOUTS_KEY) throw new Error('Cash payout processing is not configured yet.');
  const operationId = crypto.randomUUID();
  const startedAt = Date.now();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch(`${STRIPE_API_V2}${path}`, {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${env.STRIPE_GLOBAL_PAYOUTS_KEY}`,
      'Stripe-Version': env.STRIPE_GLOBAL_PAYOUTS_VERSION || STRIPE_V2_VERSION,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(stripeContext ? { 'Stripe-Context': stripeContext } : {}),
    },
    body: payload,
  });
  const responseText = await response.text();
  let result = {};
  try { result = responseText ? JSON.parse(responseText) : {}; } catch { result = {}; }
  await auditExternalCall(env, {
    service: 'stripe_global_payouts', endpointClass: `/v2${path}`, method, operationId,
    providerRequestId: response.headers.get('request-id'),
    requestPayloadSha256: await sha256Text(payload),
    responsePayloadSha256: await sha256Text(responseText), responseStatus: response.status,
    outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: response.ok ? null : 'HTTP_ERROR',
    latencyMs: Date.now() - startedAt,
  });
  if (!response.ok) throw new Error(result.error?.message || result.message || 'Stripe payout request failed.');
  return result;
}

function stripeV2IncludeQuery(values) {
  return new URLSearchParams(values.map((value, index) => [`include[${index}]`, value])).toString();
}

function referralRecipientIsReady(capability, payoutMethodId) {
  return capability?.status === 'active' && Boolean(payoutMethodId);
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
    signal: AbortSignal.timeout(15_000),
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
  const metadataDiscordUserId = String(subscription.metadata?.discord_user_id || '').trim();
  const body = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    status: subscription.status || 'unknown',
    price_id: stripeId(item?.price),
    offer: subscription.metadata?.offer || null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    cancel_at: stripeTimestamp(subscription.cancel_at),
    current_period_start: stripeTimestamp(subscription.current_period_start ?? item?.current_period_start),
    current_period_end: stripeTimestamp(subscription.current_period_end ?? item?.current_period_end),
    trial_end: stripeTimestamp(subscription.trial_end),
    last_stripe_event_id: eventId,
    raw_metadata: subscription.metadata || {},
    created_at: stripeTimestamp(subscription.created) || now,
    updated_at: now,
  };
  // Checkout completion stores the verified Discord identity on the Stripe
  // subscription. Copy it during reconciliation so subscriptions that predate
  // database persistence are imported as linked memberships, not orphan rows.
  await persistCustomer(env, customerId, {
    subscriptionId: subscription.id,
    discordUserId: metadataDiscordUserId || undefined,
  });
  // Insert if absent, then update only Stripe-owned fields. This deliberately
  // never writes entitlement_blocked so an ordinary subscription event cannot
  // clear a concurrent or existing refund/dispute block.
  await supabase(env, 'membership_subscriptions?on_conflict=stripe_subscription_id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body,
  });
  await supabase(env, `membership_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body,
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

async function activeMembershipForDiscord(env, discordUserId) {
  const customer = await membershipCustomerForDiscord(env, discordUserId);
  if (!customer?.current_subscription_id) return null;
  const rows = await supabase(env, `membership_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(customer.current_subscription_id)}&status=in.(active,trialing)&entitlement_blocked=is.false&select=stripe_subscription_id,stripe_customer_id,status&limit=1`);
  return rows?.[0] || null;
}

async function membershipEntitlementBlock(env, subscriptionId) {
  if (!subscriptionId) return null;
  const rows = await supabase(env, `membership_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=entitlement_blocked,entitlement_block_reason,entitlement_blocked_at&limit=1`);
  return rows?.[0]?.entitlement_blocked ? rows[0] : null;
}

async function referralProfileForDiscord(env, discordUserId) {
  const rows = await supabase(env, `referral_profiles?discord_user_id=eq.${encodeURIComponent(discordUserId)}&select=discord_user_id,referral_code,stripe_recipient_account_id,payout_status&limit=1`);
  return rows?.[0] || null;
}

async function referralProfileForCode(env, referralCode) {
  const rows = await supabase(env, `referral_profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=discord_user_id,referral_code,stripe_recipient_account_id,payout_status&limit=1`);
  return rows?.[0] || null;
}

async function ensureReferralProfile(env, discordUserId) {
  const existing = await referralProfileForDiscord(env, discordUserId);
  if (existing) return existing;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = `KBH-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
    try {
      const created = await supabase(env, 'referral_profiles', {
        method: 'POST',
        prefer: 'return=representation',
        body: { discord_user_id: discordUserId, referral_code: code, payout_status: 'NOT_CONNECTED' },
      });
      if (created?.[0]) return created[0];
    } catch (error) {
      const concurrent = await referralProfileForDiscord(env, discordUserId);
      if (concurrent) return concurrent;
      if (attempt === 2) throw error;
    }
  }
  throw new Error('Unable to create a referral profile.');
}

async function recordReferralEvent(env, values) {
  if (!supabaseReady(env)) return;
  await supabase(env, 'referral_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id: crypto.randomUUID(),
      referral_reward_id: values.rewardId || null,
      event_type: values.eventType,
      actor_type: values.actorType || 'system',
      actor_id: values.actorId || null,
      details: values.details || {},
      occurred_at: new Date().toISOString(),
    },
  });
}

async function createReferralAttribution(env, values) {
  if (!values.referralCode || !values.customerId || !values.subscriptionId) return null;
  const profile = await referralProfileForCode(env, values.referralCode);
  if (!profile || profile.discord_user_id !== values.referrerDiscordUserId) throw new Error('Referral attribution is invalid.');
  try {
    const created = await supabase(env, 'referral_rewards?on_conflict=referred_subscription_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: {
        referral_code: profile.referral_code,
        referrer_discord_user_id: profile.discord_user_id,
        referred_stripe_customer_id: values.customerId,
        referred_subscription_id: values.subscriptionId,
        reward_amount_cents: REFERRAL_REWARD_CENTS,
        currency: 'usd',
        status: 'PENDING_PAYMENT',
      },
    });
    const reward = created?.[0];
    if (reward) await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_ATTRIBUTED', details: { referral_code: profile.referral_code } });
    return reward || null;
  } catch (error) {
    const rows = await supabase(env, `referral_rewards?referred_subscription_id=eq.${encodeURIComponent(values.subscriptionId)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
    throw error;
  }
}

async function finalizeReferralIdentity(env, subscriptionId, customerId, referredDiscordUserId) {
  const rows = await supabase(env, `referral_rewards?referred_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id,referrer_discord_user_id,status&limit=1`);
  const reward = rows?.[0];
  if (!reward) return;
  const selfReferral = reward.referrer_discord_user_id === referredDiscordUserId;
  const existingMembership = await membershipCustomerForDiscord(env, referredDiscordUserId);
  const duplicateMember = Boolean(existingMembership?.stripe_customer_id && existingMembership.stripe_customer_id !== customerId);
  const voidReason = selfReferral ? 'SELF_REFERRAL' : duplicateMember ? 'EXISTING_MEMBER' : null;
  try {
    await supabase(env, `referral_rewards?id=eq.${encodeURIComponent(reward.id)}&payout_attempt_started_at=is.null&stripe_outbound_payment_id=is.null&status=in.(PENDING_PAYMENT,${REFERRAL_PRE_PAYOUT_STATUSES.join(',')})`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { referred_discord_user_id: referredDiscordUserId, ...(voidReason ? { status: 'VOID', status_reason: voidReason } : {}), updated_at: new Date().toISOString() },
    });
  } catch {
    // A person opening another Stripe account does not become a new referral.
    // Holding a duplicate reward must not prevent their legitimate VIP connection.
    await updateReferralReward(env, reward.id, { status: 'REVIEW_REQUIRED', status_reason: 'DUPLICATE_IDENTITY_REQUIRES_REVIEW' }, ['PENDING_PAYMENT', ...REFERRAL_PRE_PAYOUT_STATUSES]);
  }
  await recordReferralEvent(env, {
    rewardId: reward.id,
    eventType: voidReason ? 'REFERRAL_VOIDED' : 'REFERRED_DISCORD_LINKED',
    actorType: 'discord_user', actorId: referredDiscordUserId,
    details: voidReason ? { reason: voidReason } : {},
  });
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

async function secureEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(String(left))),
    crypto.subtle.digest('SHA-256', encode.encode(String(right))),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(leftHash, rightHash);
  }
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function authorizedOperationsRequest(request, env) {
  const expected = String(env.MEMBERSHIP_OPERATIONS_SECRET || '');
  const authorization = request.headers.get('authorization') || '';
  if (!expected || !authorization.startsWith('Bearer ')) return false;
  return secureEqual(authorization, `Bearer ${expected}`);
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
  for (const candidate of signatures) {
    if (await secureEqual(expected, candidate)) return true;
  }
  return false;
}

async function sign(value, secret) {
  const digest = await crypto.subtle.sign('HMAC', await signingKey(secret), encode.encode(value));
  return toHex(digest);
}

const DISCORD_CONFIG_KEYS = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_OAUTH_STATE_SECRET',
  'DISCORD_GUILD_ID',
  'DISCORD_MEMBER_ROLE_ID',
  'DISCORD_REDIRECT_URI',
];

function missingDiscordConfig(env) {
  return DISCORD_CONFIG_KEYS.filter((key) => !env?.[key]);
}

function discordReady(env) {
  return missingDiscordConfig(env).length === 0;
}

function discordNotReadyResponse(env) {
  const missing = missingDiscordConfig(env);
  console.warn('Discord connection configuration is incomplete.', { missing });
  return new Response('Discord connection is being configured. Please check back shortly.', { status: 503 });
}

async function createDiscordState({ sessionId = null, intent = 'connect' }, env) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const body = toBase64Url(encode.encode(JSON.stringify({ sessionId, intent, expiresAt: Math.floor(Date.now() / 1000) + 600, nonce: toBase64Url(bytes) })));
  return `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
}

async function readDiscordState(state, env) {
  const [body, signature, ...extra] = state.split('.');
  if (!body || !signature || extra.length || !await secureEqual(await sign(body, env.DISCORD_OAUTH_STATE_SECRET), signature)) throw new Error('Invalid Discord connection request.');
  const value = JSON.parse(decode.decode(fromBase64Url(body)));
  if (!['connect', 'portal', 'referral'].includes(value.intent) || value.expiresAt < Math.floor(Date.now() / 1000)) throw new Error('That Discord authorization link expired. Please try again.');
  if (value.intent === 'connect' && !value.sessionId) throw new Error('That Discord connection request is incomplete.');
  return value;
}

async function createReferralAuthSession(env, user) {
  if (!user?.id || !user?.email || user.verified === false) throw new Error('A verified Discord email is required to set up cash payouts.');
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await supabase(env, 'referral_auth_sessions', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      token_hash: await sha256Text(token),
      discord_user_id: user.id,
      contact_email: user.email,
      display_name: String(user.global_name || user.username || 'Kobe’s Betting Hub member').slice(0, 100),
      expires_at: expiresAt,
    },
  });
  return token;
}

async function readReferralAuthSession(env, token) {
  if (!token || token.length > 100) throw new Error('Reconnect Discord to continue.');
  const tokenHash = await sha256Text(token);
  const rows = await supabase(env, `referral_auth_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=discord_user_id,contact_email,display_name&limit=1`);
  const session = rows?.[0];
  if (!session) throw new Error('That referral session expired. Reconnect Discord to continue.');
  if (!await activeMembershipForDiscord(env, session.discord_user_id)) throw new Error('An active membership is required for referral payouts.');
  return session;
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
  if (subscription.cancel_at_period_end || subscription.cancel_at) throw new Error('This membership is already scheduled to cancel.');
  return subscription;
}

function subscriptionCancellationEnd(subscription) {
  const item = subscription?.items?.data?.[0];
  return subscription?.cancel_at
    ?? subscription?.current_period_end
    ?? item?.current_period_end
    ?? subscription?.trial_end
    ?? null;
}

function subscriptionDiscounts(subscription) {
  const current = Array.isArray(subscription?.discounts)
    ? subscription.discounts
    : Array.isArray(subscription?.discounts?.data) ? subscription.discounts.data : [];
  return subscription?.discount ? [...current, subscription.discount] : current;
}

function discountCouponId(discount) {
  if (!discount || typeof discount === 'string') return '';
  return stripeId(discount.source?.coupon) || stripeId(discount.coupon);
}

function subscriptionHasCoupon(subscription, couponId) {
  return Boolean(couponId) && subscriptionDiscounts(subscription).some((discount) => discountCouponId(discount) === couponId);
}

function retentionOfferUsed(customer, subscription, legacyCouponId = '') {
  const memberCouponId = customer?.metadata?.[RETENTION_COUPON_METADATA_KEY] || '';
  return customer?.metadata?.[RETENTION_USED_METADATA_KEY] === 'true'
    || subscription?.metadata?.retention_offer_used === 'true'
    || subscriptionHasCoupon(subscription, memberCouponId)
    || subscriptionHasCoupon(subscription, legacyCouponId);
}

function monthlyRetentionEligible(subscription, env) {
  return Boolean(env.STRIPE_MONTHLY_PRICE_ID)
    && subscription?.items?.data?.length === 1
    && stripeId(subscription.items.data[0].price) === env.STRIPE_MONTHLY_PRICE_ID;
}

function portalSessionValues(membership, customer, subscription, env, memberCouponId = '') {
  const returnUrl = `${siteOrigin(env)}${SITE_PATH}/cancel.html?portal=returned`;
  const values = {
    customer: membership.stripe_customer_id,
    return_url: returnUrl,
  };
  if (env.STRIPE_PORTAL_CONFIGURATION_ID) values.configuration = env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (!subscription?.id || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) || subscription.cancel_at_period_end || subscription.cancel_at) return values;

  values['flow_data[type]'] = 'subscription_cancel';
  values['flow_data[subscription_cancel][subscription]'] = subscription.id;
  values['flow_data[after_completion][type]'] = 'redirect';
  values['flow_data[after_completion][redirect][return_url]'] = returnUrl;
  if (monthlyRetentionEligible(subscription, env) && memberCouponId && !retentionOfferUsed(customer, subscription, env.STRIPE_RETENTION_COUPON_ID)) {
    values['flow_data[subscription_cancel][retention][type]'] = 'coupon_offer';
    values['flow_data[subscription_cancel][retention][coupon_offer][coupon]'] = memberCouponId;
  }
  return values;
}

async function ensurePerMemberRetentionCoupon(env, customer) {
  if (!env.STRIPE_RETENTION_COUPON_ID || !customer?.id || customer.metadata?.[RETENTION_USED_METADATA_KEY] === 'true') return '';
  const existingCouponId = customer.metadata?.[RETENTION_COUPON_METADATA_KEY];
  if (existingCouponId) return existingCouponId;
  const coupon = await stripe(env, '/coupons', {
    percent_off: 75,
    duration: 'once',
    max_redemptions: 1,
    name: '75% off next membership invoice',
    'metadata[kbh_retention_customer]': customer.id,
    'metadata[kbh_retention_template]': env.STRIPE_RETENTION_COUPON_ID,
  }, { idempotencyKey: `kbh-retention-coupon-${customer.id}` });
  if (!coupon?.id) throw new Error('Stripe did not create the member retention coupon.');
  await stripe(env, `/customers/${encodeURIComponent(customer.id)}`, {
    [`metadata[${RETENTION_COUPON_METADATA_KEY}]`]: coupon.id,
  }, { idempotencyKey: `kbh-retention-coupon-link-${customer.id}` });
  return coupon.id;
}

async function recordRetentionRedemption(env, subscription, eventId = null, knownCustomer = null) {
  if (!env.STRIPE_RETENTION_COUPON_ID || !subscription?.id) return false;
  const customerId = stripeId(subscription.customer);
  if (!customerId) return false;
  const customer = knownCustomer || await stripeGet(env, `/customers/${encodeURIComponent(customerId)}`);
  const couponIds = [customer?.metadata?.[RETENTION_COUPON_METADATA_KEY], env.STRIPE_RETENTION_COUPON_ID].filter(Boolean);
  let observedSubscription = subscription;
  let couponId = couponIds.find((candidate) => subscriptionHasCoupon(observedSubscription, candidate)) || '';
  if (!couponId && subscriptionDiscounts(observedSubscription).some((discount) => typeof discount === 'string')) {
    observedSubscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscription.id)}?expand[]=discounts`);
    couponId = couponIds.find((candidate) => subscriptionHasCoupon(observedSubscription, candidate)) || '';
  }
  if (!couponId) return false;
  if (customer?.metadata?.[RETENTION_USED_METADATA_KEY] === 'true') return true;
  await stripe(env, `/customers/${encodeURIComponent(customerId)}`, {
    [`metadata[${RETENTION_USED_METADATA_KEY}]`]: 'true',
    [`metadata[${RETENTION_COUPON_METADATA_KEY}]`]: couponId,
    'metadata[kbh_retention_offer_event]': eventId || 'portal_observation',
  }, { idempotencyKey: `kbh-retention-redemption-${customerId}-${couponId}` });
  await recordMembershipEvent(env, {
    eventType: 'RETENTION_OFFER_REDEEMED',
    actorType: eventId ? 'stripe_webhook' : 'system',
    actorId: eventId,
    customerId,
    subscriptionId: subscription.id,
    discordUserId: await discordUserForSubscription(env, subscription),
    details: { coupon_id: couponId },
  });
  return true;
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
    return json({ ok: true, ends_at: subscriptionCancellationEnd(updated) }, 200, origin);
  } catch (error) { return json({ error: error.message }, 403, origin); }
}

async function discordRequest(path, options = {}, env, auditContext = {}) {
  const operationId = crypto.randomUUID();
  const startedAt = Date.now();
  const response = await fetch(`https://discord.com/api/v10${path}`, options);
  await auditExternalCall(env, {
    service: 'discord', endpointClass: sanitizedEndpoint(`/api/v10${path}`), method: options.method || 'GET', operationId,
    memberId: auditContext.memberId || null,
    workflowId: auditContext.workflowId || null,
    triggerType: auditContext.triggerType || 'membership_request',
    providerRequestId: response.headers.get('x-request-id'),
    requestPayloadSha256: await sha256Text(options.body), responseStatus: response.status,
    outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR', errorClass: response.ok ? null : 'HTTP_ERROR',
    latencyMs: Date.now() - startedAt,
  });
  if (!response.ok) throw new Error(`Discord role synchronization failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

async function removeMemberRole(subscription, env) {
  const memberId = await discordUserForSubscription(env, subscription);
  if (!memberId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_MEMBER_ROLE_ID) return;
  await discordRequest(
    `/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}/roles/${env.DISCORD_MEMBER_ROLE_ID}`,
    { method: 'DELETE', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }, env,
    { memberId, triggerType: 'membership_entitlement_sync' },
  );
}

async function grantMemberRole(memberId, env) {
  if (!memberId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_MEMBER_ROLE_ID) return;
  await discordRequest(
    `/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}/roles/${env.DISCORD_MEMBER_ROLE_ID}`,
    { method: 'PUT', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }, env,
    { memberId, triggerType: 'membership_entitlement_sync' },
  );
}

async function syncMemberRole(subscription, env) {
  const memberId = await discordUserForSubscription(env, subscription);
  if (!memberId) return 'NO_DISCORD_LINK';
  const entitlementBlock = await membershipEntitlementBlock(env, subscription.id);
  if (ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) && !entitlementBlock) {
    await grantMemberRole(memberId, env);
    return 'ROLE_GRANTED';
  }
  await removeMemberRole(subscription, env);
  return entitlementBlock ? 'ROLE_REMOVED_ENTITLEMENT_BLOCKED' : 'ROLE_REMOVED';
}

const DISCORD_MANAGE_ROLES_PERMISSION = 1n << 28n;

function discordRoleReadiness(botUserId, roles, configuredRoleId) {
  const botRole = (roles || []).find((role) => String(role?.tags?.bot_id || '') === String(botUserId || ''));
  const configuredRole = (roles || []).find((role) => String(role?.id || '') === String(configuredRoleId || ''));
  const botPermissions = BigInt(String(botRole?.permissions || '0'));
  const botPosition = Number(botRole?.position ?? -1);
  const configuredRolePosition = Number(configuredRole?.position ?? -1);
  const manageRoles = Boolean(botPermissions & DISCORD_MANAGE_ROLES_PERMISSION);
  return {
    botRolePresent: Boolean(botRole),
    botRoleName: botRole?.name || null,
    configuredRolePresent: Boolean(configuredRole),
    configuredRoleName: configuredRole?.name || null,
    manageRoles,
    hierarchyReady: Boolean(botRole && configuredRole && botPosition > configuredRolePosition),
    ready: Boolean(botRole && configuredRole && manageRoles && botPosition > configuredRolePosition),
  };
}

async function inspectDiscordRoleReadiness(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_MEMBER_ROLE_ID) {
    throw new Error('Discord role configuration is incomplete.');
  }
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const [botUser, roles] = await Promise.all([
    discordRequest('/users/@me', { headers }, env, { triggerType: 'membership_operations_check' }),
    discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/roles`, { headers }, env, { triggerType: 'membership_operations_check' }),
  ]);
  return discordRoleReadiness(botUser?.id, roles, env.DISCORD_MEMBER_ROLE_ID);
}

async function listStripeSubscriptions(env) {
  const subscriptions = [];
  let startingAfter = '';
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ status: 'all', limit: '100' });
    if (startingAfter) query.set('starting_after', startingAfter);
    const response = await stripeGet(env, `/subscriptions?${query}`);
    const current = Array.isArray(response?.data) ? response.data.filter((subscription) => subscription?.id) : [];
    subscriptions.push(...current);
    if (!response?.has_more) return subscriptions;
    startingAfter = current.at(-1)?.id || '';
    if (!startingAfter) throw new Error('Stripe subscription pagination did not provide a cursor.');
  }
  throw new Error('Stripe subscription reconciliation exceeded the 500-record safety bound.');
}

async function reconcileMemberships(env) {
  if (!supabaseReady(env) || !env.STRIPE_SECRET_KEY) {
    throw new Error('Membership reconciliation requires Supabase and Stripe configuration.');
  }
  // Stripe is authoritative. Discovering from Stripe first also imports legacy
  // subscriptions created before Supabase persistence/webhooks were enabled.
  const subscriptions = await listStripeSubscriptions(env);
  const summary = { checked: 0, rolesGranted: 0, rolesRemoved: 0, noDiscordLink: 0, failed: 0 };
  for (const subscription of subscriptions) {
    const subscriptionId = subscription?.id || '';
    if (!subscriptionId) continue;
    summary.checked += 1;
    try {
      await persistSubscription(env, subscription);
      const outcome = await syncMemberRole(subscription, env);
      if (outcome === 'ROLE_GRANTED') summary.rolesGranted += 1;
      else if (outcome.startsWith('ROLE_REMOVED')) summary.rolesRemoved += 1;
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
  if (!discordReady(env)) return discordNotReadyResponse(env);
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
    scope: intent === 'connect' ? 'identify guilds.join' : intent === 'referral' ? 'identify email' : 'identify',
    state,
    prompt: 'consent',
  }).toString();
  return authorization.toString();
}

async function startReferralLogin(request, env) {
  if (!discordReady(env) || !supabaseReady(env)) return new Response('Member referrals are being configured. Please check back shortly.', { status: 503 });
  const state = await createDiscordState({ intent: 'referral' }, env);
  return redirect(discordAuthorizationUrl(state, env, 'referral'));
}

async function startPayoutOnboarding(request, env) {
  if (!supabaseReady(env) || !env.STRIPE_GLOBAL_PAYOUTS_KEY) return new Response('Cash payout setup is being configured. Please check back shortly.', { status: 503 });
  try {
    const auth = new URL(request.url).searchParams.get('auth') || '';
    const session = await readReferralAuthSession(env, auth);
    const profile = await ensureReferralProfile(env, session.discord_user_id);
    let recipientId = profile.stripe_recipient_account_id;
    if (!recipientId) {
      const recipient = await stripeV2(env, '/core/accounts', {
        method: 'POST',
        idempotencyKey: `kbh-referrer-${session.discord_user_id}`,
        body: {
          contact_email: session.contact_email,
          display_name: session.display_name,
          identity: { country: 'us', entity_type: 'individual' },
          configuration: { recipient: { capabilities: { bank_accounts: { local: { requested: true } } } } },
          metadata: { kbh_discord_user_id: session.discord_user_id, kbh_referral_code: profile.referral_code },
          include: ['identity', 'configuration.recipient', 'requirements'],
        },
      });
      recipientId = recipient.id;
      if (!recipientId) throw new Error('Stripe did not create the payout recipient.');
      await supabase(env, `referral_profiles?discord_user_id=eq.${encodeURIComponent(session.discord_user_id)}&stripe_recipient_account_id=is.null`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { stripe_recipient_account_id: recipientId, payout_status: 'ONBOARDING', updated_at: new Date().toISOString() },
      });
      await recordReferralEvent(env, { eventType: 'PAYOUT_RECIPIENT_CREATED', actorType: 'discord_user', actorId: session.discord_user_id, details: { referral_code: profile.referral_code } });
    }
    const completeUrl = `${siteOrigin(env)}${SITE_PATH}/refer.html?setup=complete&code=${encodeURIComponent(profile.referral_code)}`;
    const refreshUrl = `${siteOrigin(env)}${SITE_PATH}/refer.html?setup=refresh&code=${encodeURIComponent(profile.referral_code)}`;
    const accountLink = await stripeV2(env, '/core/account_links', {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
      body: {
        account: recipientId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: { configurations: ['recipient'], return_url: completeUrl, refresh_url: refreshUrl },
        },
      },
    });
    if (!accountLink.url) throw new Error('Stripe did not return a payout setup link.');
    return redirect(accountLink.url);
  } catch (error) {
    return new Response(error.message || 'Cash payout setup failed.', { status: 400 });
  }
}

async function startPortalLogin(request, env) {
  if (!discordReady(env) || !supabaseReady(env)) return new Response('Membership management is being configured. Please check back shortly.', { status: 503 });
  const intent = new URL(request.url).searchParams.get('intent');
  if (intent !== 'portal') return new Response('Invalid membership-management request.', { status: 400 });
  const state = await createDiscordState({ intent: 'portal' }, env);
  return redirect(discordAuthorizationUrl(state, env, 'portal'));
}

async function finishDiscordConnection(request, env) {
  if (!discordReady(env)) return discordNotReadyResponse(env);
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
    if (state.intent === 'referral') {
      if (!await activeMembershipForDiscord(env, user.id)) throw new Error('Connect the Discord account tied to an active Kobe’s Betting Hub membership.');
      const profile = await ensureReferralProfile(env, user.id);
      const auth = await createReferralAuthSession(env, user);
      await recordReferralEvent(env, { eventType: 'REFERRAL_LINK_ACCESSED', actorType: 'discord_user', actorId: user.id, details: { referral_code: profile.referral_code } });
      return redirect(`${siteOrigin(env)}${SITE_PATH}/refer.html#code=${encodeURIComponent(profile.referral_code)}&auth=${encodeURIComponent(auth)}`);
    }
    if (state.intent === 'portal') {
      const membership = await membershipCustomerForDiscord(env, user.id);
      if (!membership?.stripe_customer_id) throw new Error('No paid membership is linked to this Discord account. Connect Discord from the checkout confirmation first.');
      const customer = await stripeGet(env, `/customers/${encodeURIComponent(membership.stripe_customer_id)}`);
      const subscription = membership.current_subscription_id
        ? await stripeGet(env, `/subscriptions/${encodeURIComponent(membership.current_subscription_id)}?expand[]=discounts`)
        : null;
      const redemptionRecorded = subscription ? await recordRetentionRedemption(env, subscription, null, customer) : false;
      const memberCouponId = !monthlyRetentionEligible(subscription, env) || redemptionRecorded || retentionOfferUsed(customer, subscription, env.STRIPE_RETENTION_COUPON_ID)
        ? ''
        : await ensurePerMemberRetentionCoupon(env, customer);
      const portalValues = portalSessionValues(membership, customer, subscription, env, memberCouponId);
      const offersRetention = Boolean(portalValues['flow_data[subscription_cancel][retention][coupon_offer][coupon]']);
      const portal = await stripe(env, '/billing_portal/sessions', portalValues, {
        idempotencyKey: crypto.randomUUID(),
      });
      await recordMembershipEvent(env, {
        eventType: 'BILLING_PORTAL_OPENED', actorType: 'discord_user', actorId: user.id,
        customerId: membership.stripe_customer_id, subscriptionId: membership.current_subscription_id,
        discordUserId: user.id,
        details: { retention_offer_included: offersRetention },
      });
      return redirect(portal.url);
    }

    const subscription = await activeSubscription(state.sessionId, env);
    const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(state.sessionId)}`);
    const customerId = stripeId(session.customer) || stripeId(subscription.customer);
    const botHeaders = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    if (!supabaseReady(env)) throw new Error('Membership persistence is not configured.');
    await finalizeReferralIdentity(env, subscription.id, customerId, user.id);
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
    await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, { method: 'PUT', headers: botHeaders, body: JSON.stringify({ access_token: token.access_token }) }, env, { memberId: user.id, triggerType: 'discord_membership_link' });
    await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, { method: 'PUT', headers: botHeaders }, env, { memberId: user.id, triggerType: 'discord_membership_link' });
    return redirect(`${siteOrigin(env)}${SITE_PATH}/membership.html?checkout=connected`);
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
  if (!['starter', 'trial_2_day', 'referral_trial', 'six_month', 'annual'].includes(data.offer)) return json({ error: 'Choose an available membership offer.' }, 400, origin);
  const longTerm = ['six_month', 'annual'].includes(data.offer);
  const priceId = data.offer === 'six_month' ? env.STRIPE_SIX_MONTH_PRICE_ID
    : data.offer === 'annual' ? env.STRIPE_ANNUAL_PRICE_ID : env.STRIPE_MONTHLY_PRICE_ID;
  const suppliedRequestId = request.headers.get('X-Checkout-Request-Id');
  if (suppliedRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedRequestId)) {
    return json({ error: 'Invalid checkout request ID.' }, 400, origin);
  }
  const requestId = suppliedRequestId?.toLowerCase() || crypto.randomUUID();
  if (!env.STRIPE_SECRET_KEY || !priceId || (data.offer === 'starter' && !env.STRIPE_STARTER_PRICE_ID)) {
    return json({ error: 'Checkout is being finalized. Please try again shortly.' }, 503, origin);
  }

  let referrerProfile = null;
  if (data.offer === 'referral_trial') {
    const referralCode = String(data.referral_code || '').toUpperCase();
    if (!/^KBH-[A-Z0-9]{10}$/.test(referralCode) || !supabaseReady(env)) return json({ error: 'That referral link is invalid or expired.' }, 400, origin);
    referrerProfile = await referralProfileForCode(env, referralCode);
    if (!referrerProfile || !await activeMembershipForDiscord(env, referrerProfile.discord_user_id)) return json({ error: 'That referral link is not currently eligible.' }, 400, origin);
  }

  const membershipPage = `${siteOrigin(env)}${SITE_PATH}/membership.html`;
  const values = {
    mode: 'subscription',
    success_url: `${membershipPage}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${membershipPage}?checkout=cancel`,
    payment_method_collection: 'always',
    'payment_method_types[0]': 'card',
    billing_address_collection: 'auto',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': 1,
    'metadata[offer]': data.offer,
    'subscription_data[metadata][offer]': data.offer,
  };
  if (!longTerm) {
    values['subscription_data[trial_period_days]'] = data.offer === 'starter' ? 7 : 2;
    values['subscription_data[trial_settings][end_behavior][missing_payment_method]'] = 'cancel';
  }
  if (referrerProfile) {
    values['metadata[referral_code]'] = referrerProfile.referral_code;
    values['metadata[referrer_discord_user_id]'] = referrerProfile.discord_user_id;
    values['subscription_data[metadata][referral_code]'] = referrerProfile.referral_code;
    values['subscription_data[metadata][referrer_discord_user_id]'] = referrerProfile.discord_user_id;
  }
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

const invoiceSubscriptionId = (invoice) => stripeId(invoice?.subscription)
  || stripeId(invoice?.parent?.subscription_details?.subscription);

async function referralRewardForSubscription(env, subscriptionId) {
  const rows = await supabase(env, `referral_rewards?referred_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*&limit=1`);
  return rows?.[0] || null;
}

async function processReferralInvoicePaid(env, invoice, eventId) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId || String(invoice?.currency || '').toLowerCase() !== 'usd' || Number(invoice?.amount_paid || 0) < 3299) return 'INVOICE_NOT_REFERRAL_QUALIFIED';
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const metadata = subscription.metadata || {};
  if (metadata.offer !== 'referral_trial' || !metadata.referral_code || !metadata.referrer_discord_user_id) return 'INVOICE_NOT_REFERRAL_QUALIFIED';
  if (stripeId(subscription.items?.data?.[0]?.price) !== env.STRIPE_MONTHLY_PRICE_ID) return 'INVOICE_NOT_REFERRAL_QUALIFIED';
  let reward = await referralRewardForSubscription(env, subscriptionId);
  if (!reward) {
    reward = await createReferralAttribution(env, {
      referralCode: metadata.referral_code,
      referrerDiscordUserId: metadata.referrer_discord_user_id,
      customerId: stripeId(invoice.customer) || stripeId(subscription.customer),
      subscriptionId,
    });
    reward = reward || await referralRewardForSubscription(env, subscriptionId);
  }
  if (!reward || reward.status !== 'PENDING_PAYMENT') return reward?.status || 'REFERRAL_NOT_FOUND';
  if (stripeId(invoice.customer) !== reward.referred_stripe_customer_id) return 'REFERRAL_CUSTOMER_MISMATCH';
  if (reward.first_paid_invoice_id && reward.first_paid_invoice_id !== invoice.id) return 'REFERRAL_ALREADY_QUALIFIED';
  const paidAtSeconds = Number(invoice?.status_transitions?.paid_at || invoice?.created || Math.floor(Date.now() / 1000));
  const paidAt = new Date(paidAtSeconds * 1000);
  const eligibleAt = new Date(paidAt.getTime() + REFERRAL_HOLD_DAYS * 24 * 60 * 60 * 1000);
  const qualified = await supabase(env, `referral_rewards?id=eq.${encodeURIComponent(reward.id)}&first_paid_invoice_id=is.null&status=eq.PENDING_PAYMENT`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      first_paid_invoice_id: invoice.id,
      first_paid_at: paidAt.toISOString(),
      eligible_at: eligibleAt.toISOString(),
      status: 'HOLDING',
      status_reason: null,
      updated_at: new Date().toISOString(),
    },
  });
  if (!qualified?.length) return 'REFERRAL_ALREADY_PROCESSED';
  await recordReferralEvent(env, {
    rewardId: reward.id,
    eventType: 'FIRST_MEMBERSHIP_PAYMENT_CONFIRMED',
    details: { stripe_event_id: eventId, eligible_at: eligibleAt.toISOString(), amount_paid: Number(invoice.amount_paid) },
  });
  return 'REFERRAL_HOLD_STARTED';
}

async function voidReferralForInvoice(env, invoiceId, reason) {
  if (!invoiceId) return 'NO_REFERRAL_INVOICE';
  const rows = await supabase(env, `referral_rewards?first_paid_invoice_id=eq.${encodeURIComponent(invoiceId)}&select=id,status&limit=1`);
  const reward = rows?.[0];
  if (!reward) return 'NO_REFERRAL_INVOICE';
  // A refund must not race a claimed transfer back into a retryable state.
  const voided = await updateReferralReward(env, reward.id, { status: 'VOID', status_reason: reason }, ['PENDING_PAYMENT', ...REFERRAL_PRE_PAYOUT_STATUSES]);
  const reviewed = voided?.length ? [] : await updateReferralReward(env, reward.id, { status: 'REVIEW_REQUIRED', status_reason: reason }, ['READY', 'PAYOUT_SENT', 'PAYOUT_UNCERTAIN', 'PAYOUT_FAILED', 'REVIEW_REQUIRED']);
  const status = voided?.length ? 'VOID' : reviewed?.length ? 'REVIEW_REQUIRED' : reward.status;
  await recordReferralEvent(env, { rewardId: reward.id, eventType: status === 'VOID' ? 'REFERRAL_VOIDED' : 'REFERRAL_REVIEW_REQUIRED', details: { reason } });
  return status;
}

async function subscriptionForInvoice(env, invoiceId) {
  if (!invoiceId) return null;
  const invoice = await stripeGet(env, `/invoices/${encodeURIComponent(invoiceId)}`);
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return null;
  return stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

async function blockEntitlementForInvoice(env, invoiceId, eventId, reason) {
  const subscription = await subscriptionForInvoice(env, invoiceId);
  if (!subscription) return 'NO_MEMBERSHIP_SUBSCRIPTION';
  const customerId = stripeId(subscription.customer);
  const discordUserId = await discordUserForSubscription(env, subscription);
  await persistSubscription(env, subscription, eventId);
  await supabase(env, `membership_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      entitlement_blocked: true,
      entitlement_block_reason: reason,
      entitlement_blocked_at: new Date().toISOString(),
      last_stripe_event_id: eventId,
      updated_at: new Date().toISOString(),
    },
  });
  const roleOutcome = await syncMemberRole(subscription, env);
  await recordMembershipEvent(env, {
    eventType: 'MEMBERSHIP_ENTITLEMENT_BLOCKED',
    actorType: 'stripe_webhook',
    actorId: eventId,
    customerId,
    subscriptionId: subscription.id,
    discordUserId,
    details: { reason, role_outcome: roleOutcome },
  });
  return roleOutcome === 'NO_DISCORD_LINK' ? 'ENTITLEMENT_BLOCKED_NO_DISCORD_LINK' : 'ENTITLEMENT_BLOCKED_ROLE_REMOVED';
}

async function processInvoicePaymentFailed(env, invoice, eventId) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return 'PAYMENT_FAILED_WITHOUT_SUBSCRIPTION';
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  await persistSubscription(env, subscription, eventId);
  const roleOutcome = await syncMemberRole(subscription, env);
  await recordMembershipEvent(env, {
    eventType: 'MEMBERSHIP_PAYMENT_FAILED',
    actorType: 'stripe_webhook',
    actorId: eventId,
    customerId: stripeId(subscription.customer),
    subscriptionId,
    discordUserId: await discordUserForSubscription(env, subscription),
    details: { subscription_status: subscription.status, role_outcome: roleOutcome },
  });
  return `PAYMENT_FAILED_${roleOutcome}`;
}

const REFERRAL_PRE_PAYOUT_STATUSES = ['HOLDING', 'AWAITING_PAYOUT_SETUP', 'AWAITING_MEMBER_IDENTITY'];

async function updateReferralReward(env, rewardId, values, statuses = null) {
  const statusFilter = statuses?.length ? `&status=in.(${statuses.join(',')})` : '';
  const unclaimedFilter = statuses?.every((status) => ['PENDING_PAYMENT', ...REFERRAL_PRE_PAYOUT_STATUSES].includes(status))
    ? '&stripe_outbound_payment_id=is.null&payout_attempt_started_at=is.null' : '';
  return supabase(env, `referral_rewards?id=eq.${encodeURIComponent(rewardId)}${statusFilter}${unclaimedFilter}`, {
    method: 'PATCH', prefer: 'return=representation', body: { ...values, updated_at: new Date().toISOString() },
  });
}

function referralSafetyFailure(reason, status = 'REVIEW_REQUIRED') {
  const error = new Error(reason);
  error.referralStatus = status;
  return error;
}

async function qualifyingReferralCharge(env, reward) {
  const invoice = await stripeGet(env, `/invoices/${encodeURIComponent(reward.first_paid_invoice_id)}`);
  if (invoice.status !== 'paid' || invoice.currency !== 'usd' || Number(invoice.amount_paid) < 3299
      || stripeId(invoice.customer) !== reward.referred_stripe_customer_id
      || invoiceSubscriptionId(invoice) !== reward.referred_subscription_id) {
    throw referralSafetyFailure('PAYMENT_NO_LONGER_QUALIFIES', 'VOID');
  }
  let chargeId = stripeId(invoice.charge);
  let intentId = stripeId(invoice.payment_intent);
  if (!chargeId && !intentId) {
    const payments = await stripeGet(env, `/invoice_payments?invoice=${encodeURIComponent(invoice.id)}&status=paid&limit=100`);
    if (payments.has_more || payments.data?.length !== 1) throw referralSafetyFailure('PAYMENT_REQUIRES_REVIEW');
    const payment = payments.data[0];
    if (payment.invoice !== invoice.id || payment.status !== 'paid' || payment.currency !== 'usd' || Number(payment.amount_paid) < 3299) throw referralSafetyFailure('PAYMENT_REQUIRES_REVIEW');
    intentId = stripeId(payment.payment?.payment_intent);
    chargeId = stripeId(payment.payment?.charge);
  }
  if (!chargeId && intentId) {
    const intent = await stripeGet(env, `/payment_intents/${encodeURIComponent(intentId)}`);
    if (intent.status !== 'succeeded' || stripeId(intent.customer) !== reward.referred_stripe_customer_id) throw referralSafetyFailure('PAYMENT_REQUIRES_REVIEW');
    chargeId = stripeId(intent.latest_charge);
  }
  if (!chargeId) throw referralSafetyFailure('CHARGE_NOT_VERIFIED');
  const charge = await stripeGet(env, `/charges/${encodeURIComponent(chargeId)}`);
  if (!charge.paid || !charge.captured || charge.status !== 'succeeded' || charge.currency !== 'usd'
      || Number(charge.amount_captured) < 3299 || stripeId(charge.customer) !== reward.referred_stripe_customer_id) throw referralSafetyFailure('CHARGE_NOT_VERIFIED');
  if (charge.refunded || Number(charge.amount_refunded) > 0 || charge.disputed) throw referralSafetyFailure('PAYMENT_REFUNDED_OR_DISPUTED', 'VOID');
  const refunds = await stripeGet(env, `/refunds?charge=${encodeURIComponent(chargeId)}&limit=100`);
  if (refunds.has_more || (refunds.data || []).some((refund) => !['failed', 'canceled'].includes(refund.status))) throw referralSafetyFailure('REFUND_PENDING_OR_COMPLETED');
  if (charge.review || ['elevated', 'highest'].includes(charge.outcome?.risk_level)
      || Object.values(charge.fraud_details || {}).includes('fraudulent')) throw referralSafetyFailure('PAYMENT_RISK_REVIEW');
  const fingerprint = charge.payment_method_details?.card?.fingerprint;
  if (!fingerprint) throw referralSafetyFailure('CARD_IDENTITY_NOT_VERIFIED');
  return { chargeId, fingerprintHash: await sha256Text(fingerprint) };
}

async function checkReferrerCardIdentity(env, reward, fingerprintHash) {
  const member = await activeMembershipForDiscord(env, reward.referrer_discord_user_id);
  if (!member || member.stripe_customer_id === reward.referred_stripe_customer_id) throw referralSafetyFailure('REFERRER_IDENTITY_REQUIRES_REVIEW');
  const customer = encodeURIComponent(member.stripe_customer_id);
  const methods = await stripeGet(env, `/payment_methods?customer=${customer}&type=card&limit=100`);
  const charges = await stripeGet(env, `/charges?customer=${customer}&limit=100`);
  // Incomplete history must not silently pass a self-referral check.
  if (methods.has_more || charges.has_more) throw referralSafetyFailure('REFERRER_HISTORY_REQUIRES_REVIEW');
  const fingerprints = [...(methods.data || []).map((method) => method.card?.fingerprint), ...(charges.data || []).map((charge) => charge.payment_method_details?.card?.fingerprint)].filter(Boolean);
  if (!fingerprints.length) throw referralSafetyFailure('REFERRER_CARD_IDENTITY_NOT_VERIFIED');
  for (const fingerprint of fingerprints) {
    if (await sha256Text(fingerprint) === fingerprintHash) throw referralSafetyFailure('SHARED_CARD_REQUIRES_REVIEW');
  }
}

function referralPayoutAmount(reward) {
  const amount = Number(reward?.reward_amount_cents);
  if (![1000, 2000].includes(amount)) throw new Error('Referral reward amount is invalid.');
  return amount;
}

async function processReferralPayouts(env) {
  if (!supabaseReady(env) || !env.STRIPE_GLOBAL_PAYOUTS_KEY) return { skipped: 'not_configured', checked: 0, paid: 0 };
  const now = new Date().toISOString();
  // An interrupted/unknown attempt is never replayed, even after Stripe's
  // idempotency retention expires. An operator must reconcile the provider receipt.
  const staleAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabase(env, `referral_rewards?status=eq.READY&payout_attempt_started_at=lte.${encodeURIComponent(staleAt)}&stripe_outbound_payment_id=is.null`, {
    method: 'PATCH', prefer: 'return=minimal', body: { status: 'PAYOUT_UNCERTAIN', status_reason: 'INTERRUPTED_ATTEMPT_REQUIRES_RECONCILIATION', updated_at: now },
  });
  const rewards = await supabase(env, `referral_rewards?status=in.(${REFERRAL_PRE_PAYOUT_STATUSES.join(',')})&eligible_at=lte.${encodeURIComponent(now)}&stripe_outbound_payment_id=is.null&payout_attempt_started_at=is.null&select=*&order=eligible_at.asc&limit=50`);
  const summary = { checked: 0, paid: 0, awaitingSetup: 0, awaitingIdentity: 0, failed: 0, voided: 0, review: 0 };
  if (!rewards?.length) return summary;
  const financialAccounts = await stripeV2(env, '/money_management/financial_accounts');
  const financialAccountId = financialAccounts?.data?.[0]?.id;
  if (!financialAccountId) throw new Error('Stripe Global Payouts financial account was not found.');

  for (const reward of rewards) {
    summary.checked += 1;
    let claimed = false;
    let sendAttempted = false;
    let receiptSaved = false;
    try {
      const payoutAmount = referralPayoutAmount(reward);
      if (!reward.referred_discord_user_id) {
        summary.awaitingIdentity += 1;
        await updateReferralReward(env, reward.id, { status: 'AWAITING_MEMBER_IDENTITY', status_reason: 'REFERRED_DISCORD_NOT_CONNECTED' }, REFERRAL_PRE_PAYOUT_STATUSES);
        continue;
      }
      if (reward.referred_discord_user_id === reward.referrer_discord_user_id) {
        summary.voided += 1;
        await updateReferralReward(env, reward.id, { status: 'VOID', status_reason: 'SELF_REFERRAL' }, REFERRAL_PRE_PAYOUT_STATUSES);
        await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_VOIDED', details: { reason: 'SELF_REFERRAL' } });
        continue;
      }
      if (await membershipEntitlementBlock(env, reward.referred_subscription_id)) throw referralSafetyFailure('REFERRED_MEMBERSHIP_BLOCKED', 'VOID');
      const payment = await qualifyingReferralCharge(env, reward);
      await checkReferrerCardIdentity(env, reward, payment.fingerprintHash);
      const profile = await referralProfileForDiscord(env, reward.referrer_discord_user_id);
      if (!profile?.stripe_recipient_account_id) {
        summary.awaitingSetup += 1;
        await updateReferralReward(env, reward.id, { status: 'AWAITING_PAYOUT_SETUP', status_reason: 'RECIPIENT_NOT_CONNECTED' }, REFERRAL_PRE_PAYOUT_STATUSES);
        continue;
      }
      const includes = stripeV2IncludeQuery(['configuration.recipient']);
      const recipient = await stripeV2(env, `/core/accounts/${encodeURIComponent(profile.stripe_recipient_account_id)}?${includes}`);
      const capability = recipient?.configuration?.recipient?.capabilities?.bank_accounts?.local;
      const payoutMethods = await stripeV2(env, '/money_management/payout_methods', { stripeContext: profile.stripe_recipient_account_id });
      const payoutMethodId = payoutMethods?.data?.[0]?.id;
      if (!referralRecipientIsReady(capability, payoutMethodId)) {
        summary.awaitingSetup += 1;
        await updateReferralReward(env, reward.id, { status: 'AWAITING_PAYOUT_SETUP', status_reason: 'RECIPIENT_VERIFICATION_PENDING' }, REFERRAL_PRE_PAYOUT_STATUSES);
        continue;
      }
      if (profile.payout_status !== 'READY') {
        await supabase(env, `referral_profiles?discord_user_id=eq.${encodeURIComponent(profile.discord_user_id)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: { payout_status: 'READY', updated_at: new Date().toISOString() },
        });
        await recordReferralEvent(env, { rewardId: reward.id, eventType: 'PAYOUT_RECIPIENT_READY', actorType: 'system', actorId: profile.discord_user_id });
      }
      const claim = await updateReferralReward(env, reward.id, {
        status: 'READY', status_reason: null, payout_attempt_started_at: new Date().toISOString(),
        payment_fingerprint_sha256: payment.fingerprintHash, qualifying_charge_id: payment.chargeId,
      }, REFERRAL_PRE_PAYOUT_STATUSES);
      if (claim?.length !== 1) continue;
      claimed = true;
      const freshPayment = await qualifyingReferralCharge(env, reward);
      if (freshPayment.chargeId !== payment.chargeId || freshPayment.fingerprintHash !== payment.fingerprintHash) throw referralSafetyFailure('PAYMENT_CHANGED_DURING_REVIEW');
      const current = await supabase(env, `referral_rewards?id=eq.${encodeURIComponent(reward.id)}&status=eq.READY&stripe_outbound_payment_id=is.null&select=id&limit=1`);
      if (current?.length !== 1) continue;
      sendAttempted = true;
      const payout = await stripeV2(env, '/money_management/outbound_payments', {
        method: 'POST',
        idempotencyKey: `kbh-referral-${reward.id}`,
        body: {
          from: { financial_account: financialAccountId, currency: 'usd' },
          to: { recipient: profile.stripe_recipient_account_id, payout_method: payoutMethodId },
          amount: { value: payoutAmount, currency: 'usd' },
          description: 'Kobe’s Betting Hub referral reward',
          metadata: { referral_reward_id: reward.id, referral_code: reward.referral_code },
        },
      });
      if (!payout?.id) throw new Error('Stripe did not return a payout ID.');
      const saved = await updateReferralReward(env, reward.id, { status: 'PAYOUT_SENT', status_reason: null, stripe_outbound_payment_id: payout.id }, ['READY']);
      if (!saved?.length) {
        // A concurrent refund can flag review while Stripe accepts the transfer.
        // Preserve that flag, but save the receipt so it cannot disappear/retry.
        const reviewed = await updateReferralReward(env, reward.id, { stripe_outbound_payment_id: payout.id }, ['REVIEW_REQUIRED', 'PAYOUT_UNCERTAIN']);
        if (!reviewed?.length) throw new Error('Payout receipt requires reconciliation.');
      }
      receiptSaved = true;
      await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_PAYOUT_SENT', details: { outbound_payment_id: payout.id, amount_cents: payoutAmount } });
      summary.paid += 1;
    } catch (error) {
      summary.failed += 1;
      if (receiptSaved) continue;
      const status = sendAttempted ? 'PAYOUT_UNCERTAIN' : error.referralStatus || 'REVIEW_REQUIRED';
      const reason = sendAttempted ? 'PROVIDER_RESULT_REQUIRES_RECONCILIATION' : error.referralStatus ? error.message : 'PRECHECK_OR_DUPLICATE_REQUIRES_REVIEW';
      if (status === 'VOID') summary.voided += 1;
      else summary.review += 1;
      try {
        await updateReferralReward(env, reward.id, { status, status_reason: reason }, claimed ? ['READY'] : REFERRAL_PRE_PAYOUT_STATUSES);
        await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_SAFETY_HOLD', details: { reason } });
      } catch { /* Durable READY remains non-retryable if receipt/hold persistence fails. */ }
    }
  }
  console.log('Referral payout processing completed.', summary);
  return summary;
}

async function readTextWithLimit(request, maximumBytes) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new RangeError('Payload too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) throw new RangeError('Payload too large.');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decode.decode(payload);
}

async function handleWebhook(request, env) {
  let payload;
  try { payload = await readTextWithLimit(request, 1_000_000); }
  catch (error) {
    if (error instanceof RangeError) return new Response('Webhook payload is too large.', { status: 413 });
    throw error;
  }
  const valid = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid Stripe signature.', { status: 400 });
  if (!supabaseReady(env)) return new Response('Membership persistence is not configured.', { status: 503 });
  try {
    const event = JSON.parse(payload);
    if (!await beginWebhookEvent(env, event, payload)) return new Response('ok: duplicate', { status: 200 });
    let outcome = 'RECORDED';
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      const customerId = stripeId(session?.customer);
      const subscriptionId = stripeId(session?.subscription);
      await persistCustomer(env, customerId, { subscriptionId });
      if (session?.metadata?.offer === 'referral_trial') {
        await createReferralAttribution(env, {
          referralCode: session.metadata.referral_code,
          referrerDiscordUserId: session.metadata.referrer_discord_user_id,
          customerId,
          subscriptionId,
        });
        outcome = 'REFERRAL_CHECKOUT_RECORDED';
      } else outcome = 'CHECKOUT_RECORDED';
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      const subscription = event.data?.object;
      await persistSubscription(env, subscription, event.id);
      if (event.type === 'customer.subscription.updated') await recordRetentionRedemption(env, subscription, event.id);
      outcome = await syncMemberRole(subscription, env);
    } else if (event.type === 'invoice.paid') {
      outcome = await processReferralInvoicePaid(env, event.data?.object, event.id);
    } else if (event.type === 'invoice.payment_failed') {
      outcome = await processInvoicePaymentFailed(env, event.data?.object, event.id);
    } else if (event.type === 'charge.refunded') {
      const invoiceId = stripeId(event.data?.object?.invoice);
      const entitlementOutcome = await blockEntitlementForInvoice(env, invoiceId, event.id, 'CHARGE_REFUNDED');
      const referralOutcome = await voidReferralForInvoice(env, invoiceId, 'QUALIFYING_CHARGE_REFUNDED');
      outcome = `${entitlementOutcome};${referralOutcome}`;
    } else if (event.type === 'charge.dispute.created') {
      const chargeId = stripeId(event.data?.object?.charge);
      if (!chargeId) outcome = 'DISPUTE_WITHOUT_CHARGE';
      else {
        const charge = await stripeGet(env, `/charges/${encodeURIComponent(chargeId)}`);
        const invoiceId = stripeId(charge?.invoice);
        const entitlementOutcome = await blockEntitlementForInvoice(env, invoiceId, event.id, 'CHARGE_DISPUTED');
        const referralOutcome = await voidReferralForInvoice(env, invoiceId, 'QUALIFYING_CHARGE_DISPUTED');
        outcome = `${entitlementOutcome};${referralOutcome}`;
      }
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
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, version: env.CF_VERSION_METADATA?.id || null }, 200, origin);
    }
    if (request.method === 'POST' && url.pathname === '/ops/reconcile-memberships') {
      if (!await authorizedOperationsRequest(request, env)) return json({ error: 'Unauthorized.' }, 401, origin);
      try { return json(await reconcileMemberships(env), 200, origin); }
      catch (error) {
        console.error('Manual membership reconciliation failed.', error?.message || error);
        return json({ error: 'Membership reconciliation failed safely.' }, 500, origin);
      }
    }
    if (request.method === 'GET' && url.pathname === '/ops/discord-role-readiness') {
      if (!await authorizedOperationsRequest(request, env)) return json({ error: 'Unauthorized.' }, 401, origin);
      try { return json(await inspectDiscordRoleReadiness(env), 200, origin); }
      catch (error) {
        console.error('Discord role readiness check failed.', error?.message || error);
        return json({ error: 'Discord role readiness check failed safely.' }, 500, origin);
      }
    }
    if (request.method === 'GET' && url.pathname === '/cancel/offer') return json({ error: 'Use Discord login and Stripe Customer Portal.' }, 410, origin);
    if (request.method === 'GET' && url.pathname === '/discord/connect') return startDiscordConnection(request, env);
    if (request.method === 'GET' && url.pathname === '/discord/login') return startPortalLogin(request, env);
    if (request.method === 'GET' && url.pathname === '/referrals/login') return startReferralLogin(request, env);
    if (request.method === 'GET' && url.pathname === '/referrals/onboard') return startPayoutOnboarding(request, env);
    if (request.method === 'GET' && url.pathname === '/discord/callback') return finishDiscordConnection(request, env);
    if (request.method === 'POST' && url.pathname === '/create-checkout') {
      const limited = await checkoutRateLimitResponse(request, env, origin);
      return limited || createCheckout(request, env, origin);
    }
    if (request.method === 'POST' && ['/cancel/retain', '/cancel/confirm'].includes(url.pathname)) return json({ error: 'Use Discord login and Stripe Customer Portal.' }, 410, origin);
    if (request.method === 'POST' && url.pathname === '/stripe-webhook') return handleWebhook(request, env);
    return json({ error: 'Not found.' }, 404, origin);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([reconcileMemberships(env), processReferralPayouts(env)]));
  },
};

export const __test = {
  REFERRAL_REWARD_CENTS,
  authorizedOperationsRequest,
  claimDiscordLink,
  checkoutRateLimitResponse,
  createDiscordState,
  discordAuthorizationUrl,
  discordRoleReadiness,
  ensurePerMemberRetentionCoupon,
  invoiceSubscriptionId,
  listStripeSubscriptions,
  processReferralInvoicePaid,
  processReferralPayouts,
  qualifyingReferralCharge,
  voidReferralForInvoice,
  portalSessionValues,
  monthlyRetentionEligible,
  referralPayoutAmount,
  referralRecipientIsReady,
  retentionOfferUsed,
  siteOrigin,
  sanitizedEndpoint,
  subscriptionHasCoupon,
  subscriptionCancellationEnd,
  stripeV2IncludeQuery,
  readDiscordState,
  verifyStripeSignature,
};
