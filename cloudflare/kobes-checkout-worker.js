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
const RETENTION_50_COUPON_METADATA_KEY = 'kbh_retention_offer_50_coupon';
const RETENTION_75_COUPON_METADATA_KEY = 'kbh_retention_offer_75_coupon';
const MEMBERSHIP_OFFERS = new Set(['starter', 'trial_2_day', 'referral_trial', 'six_month', 'annual']);
const CHECKOUT_ASSOCIATION_TTL_MS = 60 * 60 * 1000;
// A private admin dashboard is commonly opened from the owner's dedicated desktop app.
// Keep the signed, allowlisted token useful for 30 days so the app does not demand
// Discord OAuth every hour. Revoking the Discord allowlist entry invalidates access.
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const headers = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_SITE_ORIGINS.has(origin) ? origin : SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Checkout-Request-Id, Authorization',
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

async function supabasePages(env, path, { pageSize = 1000, maxPages = 20 } = {}) {
  const rows = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await supabase(env, `${path}${separator}limit=${pageSize}&offset=${page * pageSize}`);
    if (!Array.isArray(batch)) throw new Error('Expected a paginated membership database result.');
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
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

async function creatorProfileForCode(env, referralCode) {
  const rows = await supabase(env, `creator_referral_profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=id,contact_email,display_name,referral_code,discord_user_id,trial_expires_at,stripe_recipient_account_id,payout_status,status&limit=1`);
  return rows?.[0] || null;
}

async function creatorProfileForId(env, id) {
  const rows = await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(id)}&select=id,contact_email,display_name,referral_code,discord_user_id,trial_expires_at,stripe_recipient_account_id,payout_status,status&limit=1`);
  return rows?.[0] || null;
}

async function referralOwnerForCode(env, referralCode) {
  if (/^KBC-[A-Z0-9]{10}$/.test(referralCode)) {
    const creator = await creatorProfileForCode(env, referralCode);
    return creator?.status === 'ACTIVE' ? { kind: 'creator', profile: creator } : null;
  }
  if (!/^KBH-[A-Z0-9]{10}$/.test(referralCode)) return null;
  const member = await referralProfileForCode(env, referralCode);
  return member && await activeMembershipForDiscord(env, member.discord_user_id)
    ? { kind: 'member', profile: member } : null;
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
  // Checkout eligibility is checked before creating Stripe's session. A creator
  // paused afterward must not break a paid customer's webhook or erase credit.
  const creator = /^KBC-[A-Z0-9]{10}$/.test(values.referralCode)
    ? await creatorProfileForCode(env, values.referralCode) : null;
  const owner = creator ? { kind: 'creator', profile: creator } : await referralOwnerForCode(env, values.referralCode);
  if (!owner || (owner.kind === 'member' && owner.profile.discord_user_id !== values.referrerDiscordUserId)
      || (owner.kind === 'creator' && owner.profile.id !== values.creatorProfileId)) throw new Error('Referral attribution is invalid.');
  try {
    const created = await supabase(env, 'referral_rewards?on_conflict=referred_subscription_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: {
        referral_code: owner.profile.referral_code,
        referrer_discord_user_id: owner.kind === 'member' ? owner.profile.discord_user_id : null,
        creator_profile_id: owner.kind === 'creator' ? owner.profile.id : null,
        referred_stripe_customer_id: values.customerId,
        referred_subscription_id: values.subscriptionId,
        reward_amount_cents: REFERRAL_REWARD_CENTS,
        currency: 'usd',
        status: 'PENDING_PAYMENT',
      },
    });
    const reward = created?.[0];
    if (reward) await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_ATTRIBUTED', details: { referral_code: owner.profile.referral_code, owner_type: owner.kind } });
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

function cleanAttribution(value = {}) {
  const text = (input, maximum = 160) => String(input || '').replace(/[\u0000-\u001f]/g, '').slice(0, maximum);
  const source = input => {
    const raw = text(input).trim().toLowerCase();
    if (['discord','x','kobe_x','instagram','tiktok','google','email','referral','affiliate','direct','other'].includes(raw)) return raw;
    if (/discord/.test(raw)) return 'discord';
    if (/^(x|twitter)$/.test(raw) || /(^|\.)x\.com$|twitter\.com|t\.co/.test(raw)) return 'x';
    if (/instagram|(^|\.)ig\.me$/.test(raw)) return 'instagram';
    if (/tiktok|(^|\.)vm\.tiktok\.com$/.test(raw)) return 'tiktok';
    if (/google/.test(raw)) return 'google';
    if (/mail|newsletter/.test(raw)) return 'email';
    if (/referr/.test(raw)) return 'referral';
    if (/affiliate|creator|partner/.test(raw)) return 'affiliate';
    return raw ? 'other' : '';
  };
  return {
    first_source: source(value.first_source) || 'direct', first_medium: text(value.first_medium),
    first_campaign: text(value.first_campaign), first_content: text(value.first_content),
    last_source: source(value.last_source) || source(value.first_source) || 'direct', last_medium: text(value.last_medium),
    last_campaign: text(value.last_campaign), last_content: text(value.last_content),
    utm_source: text(value.utm_source), utm_medium: text(value.utm_medium),
    utm_campaign: text(value.utm_campaign), utm_content: text(value.utm_content),
    referral_identifier: text(value.referral_identifier, 64), document_referrer: text(value.document_referrer, 500),
    referrer_host: text(value.referrer_host), country: text(value.country, 2).toUpperCase(),
    device: text(value.device, 24), browser: text(value.browser, 40),
    landing_path: text(value.landing_path, 300),
  };
}

function requestAttribution(request, supplied = {}) {
  const ua = String(request.headers.get('user-agent') || '');
  const device = /tablet|ipad/i.test(ua) ? 'tablet' : /mobile|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return cleanAttribution({ ...supplied, country: request.cf?.country || supplied.country, device, browser });
}

async function recordAnalyticsEvent(env, values) {
  if (!supabaseReady(env)) return;
  try { await supabase(env, 'analytics_events?on_conflict=dedupe_key', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: {
      id: crypto.randomUUID(), dedupe_key: values.dedupeKey || null,
      session_id: values.sessionId || null, event_name: values.eventName,
      path: values.path || null, offer: values.offer || null,
      stripe_customer_id: values.customerId || null,
      stripe_subscription_id: values.subscriptionId || null,
      discord_user_id: values.discordUserId || null,
      properties: values.properties || {}, occurred_at: new Date().toISOString(),
    },
  }); } catch (error) {
    // Analytics is never allowed to block checkout, payment, or entitlement.
    console.error('Unable to persist analytics event.', error?.message || error);
  }
}

async function recordSubscriptionCancellation(env, subscription) {
  if (!subscription?.id || subscription.status !== 'canceled') return;
  await recordAnalyticsEvent(env, {
    eventName: 'cancellation_completed', subscriptionId: subscription.id,
    customerId: stripeId(subscription.customer),
    dedupeKey: `cancellation_completed:${subscription.id}`,
  });
}

async function recordBillingEvent(env, event, values) {
  try { await supabase(env, 'membership_billing_events?on_conflict=stripe_event_id', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: {
      stripe_event_id: event.id, stripe_invoice_id: values.invoiceId || null,
      stripe_charge_id: values.chargeId || null, stripe_customer_id: values.customerId || null,
      stripe_subscription_id: values.subscriptionId || null, event_type: values.eventType,
      amount_cents: Number.isSafeInteger(values.amountCents) ? values.amountCents : null,
      currency: values.currency || null, billing_reason: values.billingReason || null,
      occurred_at: stripeTimestamp(event.created) || new Date().toISOString(),
    },
  }); } catch (error) {
    // Billing/access webhooks must keep working during a guarded schema rollout.
    console.error('Unable to persist billing analytics event.', error?.message || error);
  }
}

async function checkoutAssociationByToken(env, token) {
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token || '')) return null;
  const rows = await supabase(env, `membership_checkout_associations?public_token_hash=eq.${encodeURIComponent(await sha256Text(token))}&select=*&limit=1`);
  return rows?.[0] || null;
}

async function updateCheckoutAssociation(env, id, body, statuses = null) {
  const status = statuses?.length ? `&status=in.(${statuses.join(',')})` : '';
  return supabase(env, `membership_checkout_associations?id=eq.${encodeURIComponent(id)}${status}`, {
    method: 'PATCH', prefer: 'return=representation', body: { ...body, updated_at: new Date().toISOString() },
  });
}

function safeActivationError(error) {
  const message = String(error?.message || error || 'unknown');
  if (/already connected|claim/i.test(message)) return 'IDENTITY_CONFLICT';
  if (/Discord role synchronization failed \(403\)/.test(message)) return 'DISCORD_PERMISSION_DENIED';
  if (/Discord role synchronization failed \(404\)/.test(message)) return 'DISCORD_MEMBER_NOT_FOUND';
  if (/Discord/.test(message)) return 'DISCORD_TEMPORARY_FAILURE';
  if (/active|payment|subscription/i.test(message)) return 'ENTITLEMENT_NOT_ELIGIBLE';
  return 'ACTIVATION_FAILED';
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

async function createDiscordState({ sessionId = null, associationToken = null, referralCode = null, intent = 'connect' }, env) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const body = toBase64Url(encode.encode(JSON.stringify({ sessionId, associationToken, referralCode, intent, expiresAt: Math.floor(Date.now() / 1000) + 600, nonce: toBase64Url(bytes) })));
  return `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
}

async function readDiscordState(state, env) {
  const [body, signature, ...extra] = state.split('.');
  if (!body || !signature || extra.length || !await secureEqual(await sign(body, env.DISCORD_OAUTH_STATE_SECRET), signature)) throw new Error('Invalid Discord connection request.');
  const value = JSON.parse(decode.decode(fromBase64Url(body)));
  if (!['connect', 'portal', 'referral', 'creator', 'retention75', 'precheckout', 'admin', 'member', 'feedback'].includes(value.intent) || value.expiresAt < Math.floor(Date.now() / 1000)) throw new Error('That Discord authorization link expired. Please try again.');
  if (value.intent === 'connect' && !value.sessionId) throw new Error('That Discord connection request is incomplete.');
  if (value.intent === 'precheckout' && !value.associationToken) throw new Error('That checkout verification request is incomplete.');
  if (value.intent === 'creator' && !/^KBC-[A-Z0-9]{10}$/.test(value.referralCode || '')) throw new Error('That creator connection request is incomplete.');
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
  const memberCouponIds = [
    customer?.metadata?.[RETENTION_COUPON_METADATA_KEY],
    customer?.metadata?.[RETENTION_50_COUPON_METADATA_KEY],
    customer?.metadata?.[RETENTION_75_COUPON_METADATA_KEY],
  ].filter(Boolean);
  return customer?.metadata?.[RETENTION_USED_METADATA_KEY] === 'true'
    || subscription?.metadata?.retention_offer_used === 'true'
    || memberCouponIds.some((couponId) => subscriptionHasCoupon(subscription, couponId))
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

async function ensurePerMemberRetentionCoupon(env, customer, percent = 50) {
  if (!env.STRIPE_RETENTION_COUPON_ID || !customer?.id || customer.metadata?.[RETENTION_USED_METADATA_KEY] === 'true') return '';
  if (![50, 75].includes(percent)) throw new Error('Invalid retention discount.');
  const metadataKey = percent === 50 ? RETENTION_50_COUPON_METADATA_KEY : RETENTION_75_COUPON_METADATA_KEY;
  const existingCouponId = customer.metadata?.[metadataKey];
  if (existingCouponId) return existingCouponId;
  const coupon = await stripe(env, '/coupons', {
    percent_off: percent,
    duration: 'once',
    max_redemptions: 1,
    name: `${percent}% off next membership invoice`,
    'metadata[kbh_retention_customer]': customer.id,
    'metadata[kbh_retention_percent]': percent,
    'metadata[kbh_retention_template]': env.STRIPE_RETENTION_COUPON_ID,
  }, { idempotencyKey: `kbh-retention-${percent}-coupon-${customer.id}` });
  if (!coupon?.id) throw new Error('Stripe did not create the member retention coupon.');
  await stripe(env, `/customers/${encodeURIComponent(customer.id)}`, {
    [`metadata[${metadataKey}]`]: coupon.id,
  }, { idempotencyKey: `kbh-retention-${percent}-coupon-link-${customer.id}` });
  return coupon.id;
}

async function recordRetentionRedemption(env, subscription, eventId = null, knownCustomer = null) {
  if (!env.STRIPE_RETENTION_COUPON_ID || !subscription?.id) return false;
  const customerId = stripeId(subscription.customer);
  if (!customerId) return false;
  const customer = knownCustomer || await stripeGet(env, `/customers/${encodeURIComponent(customerId)}`);
  const couponIds = [
    customer?.metadata?.[RETENTION_COUPON_METADATA_KEY],
    customer?.metadata?.[RETENTION_50_COUPON_METADATA_KEY],
    customer?.metadata?.[RETENTION_75_COUPON_METADATA_KEY],
    env.STRIPE_RETENTION_COUPON_ID,
  ].filter(Boolean);
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
  await recordAnalyticsEvent(env, { eventName: 'retention_offer_accepted', customerId, subscriptionId: subscription.id, discordUserId: await discordUserForSubscription(env, subscription), dedupeKey: `retention_accepted:${subscription.id}` });
  return true;
}

async function acceptLastChanceRetention(env, membership, customer, subscription, discordUserId) {
  if (!subscription?.id || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) throw new Error('This membership is not eligible for the last-chance offer.');
  if (!monthlyRetentionEligible(subscription, env)) throw new Error('The last-chance offer is only available for monthly memberships.');
  if (!subscription.cancel_at_period_end) throw new Error('Complete the cancellation in Stripe before using the last-chance offer.');
  if (retentionOfferUsed(customer, subscription, env.STRIPE_RETENTION_COUPON_ID)) throw new Error('The one-time retention offer has already been used.');
  const couponId = await ensurePerMemberRetentionCoupon(env, customer, 75);
  if (!couponId) throw new Error('The last-chance offer is unavailable.');
  const now = new Date().toISOString();
  await stripe(env, `/subscriptions/${encodeURIComponent(subscription.id)}`, {
    cancel_at_period_end: false,
    'discounts[0][coupon]': couponId,
    'metadata[retention_offer_used]': 'true',
    'metadata[retention_offer_percent]': 75,
    'metadata[retention_offer_redeemed_at]': now,
  }, { idempotencyKey: `kbh-retention-75-accept-${subscription.id}` });
  await stripe(env, `/customers/${encodeURIComponent(customer.id)}`, {
    [`metadata[${RETENTION_USED_METADATA_KEY}]`]: 'true',
    [`metadata[${RETENTION_75_COUPON_METADATA_KEY}]`]: couponId,
    'metadata[kbh_retention_offer_event]': 'last_chance_acceptance',
  }, { idempotencyKey: `kbh-retention-75-used-${customer.id}` });
  await recordMembershipEvent(env, {
    eventType: 'RETENTION_OFFER_REDEEMED', actorType: 'discord_user', actorId: discordUserId,
    customerId: customer.id, subscriptionId: subscription.id, discordUserId,
    details: { coupon_id: couponId, percent: 75, stage: 'last_chance' },
  });
  await recordAnalyticsEvent(env, { eventName: 'retention_offer_accepted', customerId: customer.id, subscriptionId: subscription.id, discordUserId, dedupeKey: `retention_accepted:${subscription.id}` });
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
    scope: ['connect', 'precheckout'].includes(intent) ? 'identify guilds.join' : intent === 'creator' ? 'identify email guilds.join' : intent === 'referral' ? 'identify email' : 'identify',
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

async function startCreatorLogin(request, env) {
  if (!discordReady(env) || !supabaseReady(env)) return new Response('Creator access is being configured.', { status: 503 });
  const referralCode = new URL(request.url).searchParams.get('code') || '';
  const profile = /^KBC-[A-Z0-9]{10}$/.test(referralCode) ? await creatorProfileForCode(env, referralCode) : null;
  if (!profile || profile.status === 'PAUSED') return new Response('Creator invitation not found.', { status: 404 });
  const state = await createDiscordState({ intent: 'creator', referralCode }, env);
  return redirect(discordAuthorizationUrl(state, env, 'creator'));
}

async function createCreatorInvitation(request, env, origin) {
  if (!await authorizedOperationsRequest(request, env)) return json({ error: 'Unauthorized.' }, 401, origin);
  if (!supabaseReady(env)) return json({ error: 'Creator records are unavailable.' }, 503, origin);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  const email = String(data.email || '').trim().toLowerCase();
  const name = String(data.name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name.length < 2 || name.length > 120) {
    return json({ error: 'A valid creator email and name are required.' }, 400, origin);
  }
  const existing = await supabase(env, `creator_referral_profiles?contact_email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
  let profile = existing?.[0];
  if (!profile) {
    for (let attempt = 0; attempt < 3 && !profile; attempt += 1) {
      const code = `KBC-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
      try {
        const rows = await supabase(env, 'creator_referral_profiles', {
          method: 'POST', prefer: 'return=representation',
          body: { contact_email: email, display_name: name, referral_code: code },
        });
        profile = rows?.[0];
      } catch (error) {
        const concurrent = await supabase(env, `creator_referral_profiles?contact_email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
        profile = concurrent?.[0];
        if (!profile && attempt === 2) throw error;
      }
    }
  }
  return json({ email: profile.contact_email, status: profile.status,
    onboardingUrl: `${new URL(request.url).origin}/creators/login?code=${encodeURIComponent(profile.referral_code)}`,
    referralUrl: `${siteOrigin(env)}${SITE_PATH}/join?ref=${encodeURIComponent(profile.referral_code)}`,
    rewardCents: REFERRAL_REWARD_CENTS }, 200, origin);
}

async function activateCreator(request, env, origin) {
  if (!await authorizedOperationsRequest(request, env)) return json({ error: 'Unauthorized.' }, 401, origin);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  const code = String(data.code || '').toUpperCase();
  const profile = /^KBC-[A-Z0-9]{10}$/.test(code) ? await creatorProfileForCode(env, code) : null;
  if (!profile || !profile.discord_user_id || !profile.stripe_recipient_account_id) return json({ error: 'Creator email, Discord, and Stripe setup must be complete.' }, 409, origin);
  const includes = stripeV2IncludeQuery(['configuration.recipient']);
  const recipient = await stripeV2(env, `/core/accounts/${encodeURIComponent(profile.stripe_recipient_account_id)}?${includes}`);
  const capability = recipient?.configuration?.recipient?.capabilities?.bank_accounts?.local;
  const methods = await stripeV2(env, '/money_management/payout_methods', { stripeContext: profile.stripe_recipient_account_id });
  if (!referralRecipientIsReady(capability, methods?.data?.[0]?.id)) return json({ error: 'Stripe payout verification is not complete.' }, 409, origin);
  await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}&status=eq.PENDING`, {
    method: 'PATCH', prefer: 'return=minimal', body: { status: 'ACTIVE', payout_status: 'READY', updated_at: new Date().toISOString() },
  });
  return json({ status: 'ACTIVE', referralUrl: `${siteOrigin(env)}${SITE_PATH}/join?ref=${encodeURIComponent(code)}` }, 200, origin);
}

async function expireCreatorTrials(env) {
  if (!supabaseReady(env) || !env.DISCORD_BOT_TOKEN) return;
  const now = new Date().toISOString();
  const expired = await supabase(env, `creator_referral_profiles?trial_expires_at=lte.${encodeURIComponent(now)}&trial_role_removed_at=is.null&discord_user_id=not.is.null&select=id,discord_user_id&limit=50`);
  for (const profile of expired || []) {
    try {
      if (!await activeMembershipForDiscord(env, profile.discord_user_id)) {
        await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${profile.discord_user_id}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, {
          method: 'DELETE', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
        }, env, { memberId: profile.discord_user_id, triggerType: 'creator_trial_expired' });
      }
      await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}&trial_role_removed_at=is.null`, {
        method: 'PATCH', prefer: 'return=minimal', body: { trial_role_removed_at: now, updated_at: now },
      });
    } catch (error) { console.error('Creator trial expiry requires attention.', { creatorId: profile.id, error: String(error?.message || error) }); }
  }
}

async function activateReadyCreators(env) {
  if (!supabaseReady(env) || !env.STRIPE_GLOBAL_PAYOUTS_KEY) return;
  const pending = await supabase(env, 'creator_referral_profiles?status=eq.PENDING&stripe_recipient_account_id=not.is.null&discord_user_id=not.is.null&select=id,stripe_recipient_account_id&limit=25');
  for (const profile of pending || []) {
    try {
      const includes = stripeV2IncludeQuery(['configuration.recipient']);
      const recipient = await stripeV2(env, `/core/accounts/${encodeURIComponent(profile.stripe_recipient_account_id)}?${includes}`);
      const methods = await stripeV2(env, '/money_management/payout_methods', { stripeContext: profile.stripe_recipient_account_id });
      if (!referralRecipientIsReady(recipient?.configuration?.recipient?.capabilities?.bank_accounts?.local, methods?.data?.[0]?.id)) continue;
      await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}&status=eq.PENDING`, {
        method: 'PATCH', prefer: 'return=minimal', body: { status: 'ACTIVE', payout_status: 'READY', updated_at: new Date().toISOString() },
      });
    } catch (error) { console.error('Creator payout activation requires attention.', { creatorId: profile.id, error: String(error?.message || error) }); }
  }
}

async function creatorPayoutOnboarding(env, profile) {
  if (!env.STRIPE_GLOBAL_PAYOUTS_KEY) throw new Error('Creator payout setup is unavailable.');
  let recipientId = profile.stripe_recipient_account_id;
  if (!recipientId) {
    const recipient = await stripeV2(env, '/core/accounts', {
      method: 'POST', idempotencyKey: `kbh-creator-${profile.id}`,
      body: {
        contact_email: profile.contact_email, display_name: profile.display_name,
        identity: { country: 'us' },
        configuration: { recipient: { capabilities: { bank_accounts: { local: { requested: true } } } } },
        metadata: { kbh_creator_profile_id: profile.id, kbh_referral_code: profile.referral_code },
        include: ['identity', 'configuration.recipient', 'requirements'],
      },
    });
    recipientId = recipient.id;
    if (!recipientId) throw new Error('Stripe did not create a creator payout recipient.');
    await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}&stripe_recipient_account_id=is.null`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: { stripe_recipient_account_id: recipientId, payout_status: 'ONBOARDING', updated_at: new Date().toISOString() },
    });
  }
  const returnUrl = `${siteOrigin(env)}${SITE_PATH}/creator.html?setup=complete`;
  const refreshUrl = `${siteOrigin(env)}${SITE_PATH}/creator.html?setup=refresh`;
  const link = await stripeV2(env, '/core/account_links', {
    method: 'POST', idempotencyKey: crypto.randomUUID(),
    body: { account: recipientId, use_case: { type: 'account_onboarding', account_onboarding: {
      configurations: ['recipient'], return_url: returnUrl, refresh_url: refreshUrl,
    } } },
  });
  if (!link.url) throw new Error('Stripe did not return a creator payout setup link.');
  return link.url;
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
  if (!['portal', 'retention75'].includes(intent)) return new Response('Invalid membership-management request.', { status: 400 });
  const state = await createDiscordState({ intent }, env);
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
    if (state.intent === 'creator') {
      const profile = await creatorProfileForCode(env, state.referralCode);
      if (!profile || profile.status === 'PAUSED' || !user?.id || user.verified !== true
          || String(user.email || '').trim().toLowerCase() !== profile.contact_email) {
        throw new Error('Use a Discord account with the verified email on your creator invitation.');
      }
      if (profile.discord_user_id && profile.discord_user_id !== user.id) throw new Error('This creator invitation is already linked to a different Discord account.');
      if (!profile.discord_user_id) {
        const updated = await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}&discord_user_id=is.null`, {
          method: 'PATCH', prefer: 'return=representation',
          body: { discord_user_id: user.id, updated_at: new Date().toISOString() },
        });
        if (!updated?.length) throw new Error('Creator identity was changed during verification.');
      }
      let trialExpiresAt = profile.trial_expires_at;
      if (!trialExpiresAt) {
        trialExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        const claimed = await supabase(env, `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}&trial_expires_at=is.null`, {
          method: 'PATCH', prefer: 'return=representation',
          body: { trial_expires_at: trialExpiresAt, updated_at: new Date().toISOString() },
        });
        if (!claimed?.length) trialExpiresAt = (await creatorProfileForId(env, profile.id))?.trial_expires_at;
      }
      if (trialExpiresAt && Date.parse(trialExpiresAt) > Date.now()) {
        const botHeaders = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
        await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, {
          method: 'PUT', headers: botHeaders, body: JSON.stringify({ access_token: token.access_token }),
        }, env, { memberId: user.id, triggerType: 'creator_trial' });
        await grantMemberRole(user.id, env);
      }
      return redirect(await creatorPayoutOnboarding(env, profile));
    }
    if (state.intent === 'member') {
      const membership = await membershipCustomerForDiscord(env, user.id);
      if (!membership?.stripe_customer_id) return redirect(`${siteOrigin(env)}${SITE_PATH}/member#connection=required`);
      const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
      const body = toBase64Url(encode.encode(JSON.stringify({ discordUserId: user.id, expiresAt, purpose: 'member' })));
      const memberToken = `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
      return redirect(`${siteOrigin(env)}${SITE_PATH}/member#session=${encodeURIComponent(memberToken)}`);
    }
    if (state.intent === 'feedback') {
      const membership = await membershipCustomerForDiscord(env, user.id);
      if (!membership?.current_subscription_id) throw new Error('No connected membership was found.');
      const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
      const body = toBase64Url(encode.encode(JSON.stringify({ discordUserId: user.id, expiresAt, purpose: 'member' })));
      const memberToken = `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
      return redirect(`${siteOrigin(env)}${SITE_PATH}/managemembership?portal=feedback#session=${encodeURIComponent(memberToken)}`);
    }
    if (state.intent === 'admin') {
      const allowed = new Set(String(env.ADMIN_DISCORD_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
      if (!allowed.has(user.id)) throw new Error('This Discord account is not authorized for administration.');
      const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
      const body = toBase64Url(encode.encode(JSON.stringify({ discordUserId: user.id, expiresAt, purpose: 'admin' })));
      const adminToken = `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
      return redirect(`${siteOrigin(env)}${SITE_PATH}/admin/analytics#session=${encodeURIComponent(adminToken)}`);
    }
    if (state.intent === 'precheckout') {
      const association = await checkoutAssociationByToken(env, state.associationToken);
      if (!association || new Date(association.expires_at).getTime() <= Date.now()) throw new Error('That checkout verification expired. Please select your offer again.');
      if (!['PENDING_DISCORD', 'DISCORD_VERIFIED'].includes(association.status)) throw new Error('That checkout verification was already used.');
      const linked = await membershipCustomerForDiscord(env, user.id);
      if (linked?.stripe_customer_id && linked.current_subscription_id) {
        const current = await stripeGet(env, `/subscriptions/${encodeURIComponent(linked.current_subscription_id)}`);
        if (ACTIVE_SUBSCRIPTION_STATUSES.has(current.status)) {
          return redirect(`${siteOrigin(env)}${SITE_PATH}/managemembership?portal=existing`);
        }
      }
      // Joining the public server is not a paid entitlement. No role is granted
      // here; the verified Stripe webhook is the only activation authority.
      await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, {
        method: 'PUT', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token.access_token }),
      }, env, { memberId: user.id, triggerType: 'precheckout_identity_verification' });
      await updateCheckoutAssociation(env, association.id, { discord_user_id: user.id, status: 'DISCORD_VERIFIED' }, ['PENDING_DISCORD', 'DISCORD_VERIFIED']);
      await recordAnalyticsEvent(env, {
        eventName: 'discord_verified', sessionId: association.analytics_session_id,
        offer: association.offer, discordUserId: user.id, dedupeKey: `discord_verified:${association.id}`,
      });
      const checkout = await createAssociatedCheckout(env, association, state.associationToken, user.id);
      return redirect(checkout.url);
    }
    if (state.intent === 'referral') {
      if (!await activeMembershipForDiscord(env, user.id)) throw new Error('Connect the Discord account tied to an active Kobe’s Betting Hub membership.');
      const profile = await ensureReferralProfile(env, user.id);
      const auth = await createReferralAuthSession(env, user);
      await recordReferralEvent(env, { eventType: 'REFERRAL_LINK_ACCESSED', actorType: 'discord_user', actorId: user.id, details: { referral_code: profile.referral_code } });
      return redirect(`${siteOrigin(env)}${SITE_PATH}/refer.html#code=${encodeURIComponent(profile.referral_code)}&auth=${encodeURIComponent(auth)}`);
    }
    if (state.intent === 'portal') {
      const membership = await membershipCustomerForDiscord(env, user.id);
      if (!membership?.stripe_customer_id) {
        // Do not infer a wallet customer's identity or offer another purchase.
        // Initial account linking still requires their private checkout proof.
        return redirect(`${siteOrigin(env)}${SITE_PATH}/managemembership?portal=connection_required`);
      }
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
      if (offersRetention) await recordAnalyticsEvent(env, { eventName: 'retention_offer_shown', customerId: membership.stripe_customer_id, subscriptionId: membership.current_subscription_id, discordUserId: user.id, dedupeKey: `retention_shown:${membership.current_subscription_id}` });
      return redirect(portal.url);
    }
    if (state.intent === 'retention75') {
      const membership = await membershipCustomerForDiscord(env, user.id);
      if (!membership?.stripe_customer_id || !membership.current_subscription_id) throw new Error('No connected membership was found.');
      const customer = await stripeGet(env, `/customers/${encodeURIComponent(membership.stripe_customer_id)}`);
      const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(membership.current_subscription_id)}?expand[]=discounts`);
      await acceptLastChanceRetention(env, membership, customer, subscription, user.id);
      return redirect(`${siteOrigin(env)}${SITE_PATH}/managemembership?portal=retained75`);
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
    return redirect(`${siteOrigin(env)}${SITE_PATH}/join?checkout=connected#connect-discord`);
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

async function prepareCheckout(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  if (!MEMBERSHIP_OFFERS.has(data.offer)) return json({ error: 'Choose an available membership offer.' }, 400, origin);
  const referralCode = String(data.referral_code || '').toUpperCase();
  if (data.offer === 'referral_trial') {
    if (!await referralOwnerForCode(env, referralCode)) return json({ error: 'That referral link is not currently eligible.' }, 400, origin);
  }
  const sessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.analytics_session_id || '')
    ? data.analytics_session_id.toLowerCase() : null;
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const created = await supabase(env, 'membership_checkout_associations', {
    method: 'POST', prefer: 'return=representation',
    body: {
      public_token_hash: await sha256Text(token), offer: data.offer,
      referral_code: data.offer === 'referral_trial' ? referralCode : null,
      analytics_session_id: sessionId, attribution: cleanAttribution(data.attribution),
      expires_at: new Date(Date.now() + CHECKOUT_ASSOCIATION_TTL_MS).toISOString(),
    },
  });
  const association = created?.[0];
  if (!association) return json({ error: 'Unable to prepare checkout.' }, 503, origin);
  await recordAnalyticsEvent(env, { eventName: 'offer_selected', sessionId, offer: data.offer, dedupeKey: `offer_selected:${association.id}` });
  const state = await createDiscordState({ associationToken: token, intent: 'precheckout' }, env);
  return json({ url: discordAuthorizationUrl(state, env, 'precheckout') }, 200, origin);
}

async function createAssociatedCheckout(env, association, publicToken, discordUserId) {
  const longTerm = ['six_month', 'annual'].includes(association.offer);
  const priceId = association.offer === 'six_month' ? env.STRIPE_SIX_MONTH_PRICE_ID
    : association.offer === 'annual' ? env.STRIPE_ANNUAL_PRICE_ID : env.STRIPE_MONTHLY_PRICE_ID;
  if (!env.STRIPE_SECRET_KEY || !priceId || (association.offer === 'starter' && !env.STRIPE_STARTER_PRICE_ID)) throw new Error('Checkout is being finalized. Please try again shortly.');
  const values = {
    mode: 'subscription',
    success_url: `${siteOrigin(env)}${SITE_PATH}/welcome?state=${encodeURIComponent(publicToken)}`,
    cancel_url: `${siteOrigin(env)}${SITE_PATH}/join?checkout=cancel`,
    payment_method_collection: 'always', 'payment_method_types[0]': 'card', billing_address_collection: 'auto',
    'line_items[0][price]': priceId, 'line_items[0][quantity]': 1,
    'metadata[offer]': association.offer, 'metadata[checkout_association_id]': association.id,
    'subscription_data[metadata][offer]': association.offer,
    'subscription_data[metadata][checkout_association_id]': association.id,
  };
  if (!longTerm) {
    values['subscription_data[trial_period_days]'] = association.offer === 'starter' ? 7 : 2;
    values['subscription_data[trial_settings][end_behavior][missing_payment_method]'] = 'cancel';
  }
  if (association.referral_code) {
    const owner = await referralOwnerForCode(env, association.referral_code);
    if (!owner) throw new Error('Referral link is no longer eligible.');
    values['metadata[referral_code]'] = association.referral_code;
    values['subscription_data[metadata][referral_code]'] = association.referral_code;
    if (owner.kind === 'creator') {
      values['metadata[creator_profile_id]'] = owner.profile.id;
      values['subscription_data[metadata][creator_profile_id]'] = owner.profile.id;
    } else {
      values['metadata[referrer_discord_user_id]'] = owner.profile.discord_user_id;
      values['subscription_data[metadata][referrer_discord_user_id]'] = owner.profile.discord_user_id;
    }
  }
  if (association.offer === 'starter') {
    values['line_items[1][price]'] = env.STRIPE_STARTER_PRICE_ID;
    values['line_items[1][quantity]'] = 1;
  }
  const checkout = await stripe(env, '/checkout/sessions', values, { idempotencyKey: `precheckout-${association.id}`, clientRequestId: association.id });
  await updateCheckoutAssociation(env, association.id, { stripe_checkout_session_id: checkout.id, status: 'CHECKOUT_STARTED' }, ['DISCORD_VERIFIED']);
  await recordAnalyticsEvent(env, {
    eventName: 'checkout_started', sessionId: association.analytics_session_id, offer: association.offer,
    discordUserId, dedupeKey: `checkout_started:${association.id}`,
  });
  return checkout;
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

  let referralOwner = null;
  if (data.offer === 'referral_trial') {
    const referralCode = String(data.referral_code || '').toUpperCase();
    if (!supabaseReady(env)) return json({ error: 'That referral link is invalid or expired.' }, 400, origin);
    referralOwner = await referralOwnerForCode(env, referralCode);
    if (!referralOwner) return json({ error: 'That referral link is not currently eligible.' }, 400, origin);
  }

  // Go straight to the canonical confirmation page, avoiding the legacy
  // membership.html meta-refresh redirect between payment and Discord linking.
  const membershipPage = `${siteOrigin(env)}${SITE_PATH}/join`;
  const values = {
    mode: 'subscription',
    success_url: `${membershipPage}?checkout=success&session_id={CHECKOUT_SESSION_ID}#connect-discord`,
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
  if (referralOwner) {
    values['metadata[referral_code]'] = referralOwner.profile.referral_code;
    values['subscription_data[metadata][referral_code]'] = referralOwner.profile.referral_code;
    if (referralOwner.kind === 'creator') {
      values['metadata[creator_profile_id]'] = referralOwner.profile.id;
      values['subscription_data[metadata][creator_profile_id]'] = referralOwner.profile.id;
    } else {
      values['metadata[referrer_discord_user_id]'] = referralOwner.profile.discord_user_id;
      values['subscription_data[metadata][referrer_discord_user_id]'] = referralOwner.profile.discord_user_id;
    }
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
  if (metadata.offer !== 'referral_trial' || !metadata.referral_code || !(metadata.referrer_discord_user_id || metadata.creator_profile_id)) return 'INVOICE_NOT_REFERRAL_QUALIFIED';
  if (stripeId(subscription.items?.data?.[0]?.price) !== env.STRIPE_MONTHLY_PRICE_ID) return 'INVOICE_NOT_REFERRAL_QUALIFIED';
  let reward = await referralRewardForSubscription(env, subscriptionId);
  if (!reward) {
    reward = await createReferralAttribution(env, {
      referralCode: metadata.referral_code,
      referrerDiscordUserId: metadata.referrer_discord_user_id,
      creatorProfileId: metadata.creator_profile_id,
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

async function checkCreatorIdentity(env, reward, profile, fingerprintHash) {
  if (!profile || profile.status !== 'ACTIVE') throw referralSafetyFailure('CREATOR_NOT_ACTIVE');
  const customer = await stripeGet(env, `/customers/${encodeURIComponent(reward.referred_stripe_customer_id)}`);
  if (!customer?.email) throw referralSafetyFailure('REFERRED_EMAIL_REQUIRES_REVIEW');
  if (customer.email.trim().toLowerCase() === profile.contact_email) throw referralSafetyFailure('SELF_REFERRAL', 'VOID');
  // Check every Stripe customer using the creator's email. An incomplete list
  // must be reviewed rather than silently passing an identity comparison.
  const matches = await stripeGet(env, `/customers?email=${encodeURIComponent(profile.contact_email)}&limit=100`);
  if (matches.has_more) throw referralSafetyFailure('CREATOR_HISTORY_REQUIRES_REVIEW');
  for (const match of matches.data || []) {
    if (match.id === reward.referred_stripe_customer_id) throw referralSafetyFailure('SELF_REFERRAL', 'VOID');
    const methods = await stripeGet(env, `/payment_methods?customer=${encodeURIComponent(match.id)}&type=card&limit=100`);
    const charges = await stripeGet(env, `/charges?customer=${encodeURIComponent(match.id)}&limit=100`);
    if (methods.has_more || charges.has_more) throw referralSafetyFailure('CREATOR_HISTORY_REQUIRES_REVIEW');
    const fingerprints = [...(methods.data || []).map((method) => method.card?.fingerprint),
      ...(charges.data || []).map((charge) => charge.payment_method_details?.card?.fingerprint)].filter(Boolean);
    for (const fingerprint of fingerprints) {
      if (await sha256Text(fingerprint) === fingerprintHash) throw referralSafetyFailure('SHARED_CARD_REQUIRES_REVIEW');
    }
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
      if (reward.referrer_discord_user_id && reward.referred_discord_user_id === reward.referrer_discord_user_id) {
        summary.voided += 1;
        await updateReferralReward(env, reward.id, { status: 'VOID', status_reason: 'SELF_REFERRAL' }, REFERRAL_PRE_PAYOUT_STATUSES);
        await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_VOIDED', details: { reason: 'SELF_REFERRAL' } });
        continue;
      }
      if (reward.creator_profile_id) {
        const creator = await creatorProfileForId(env, reward.creator_profile_id);
        if (creator?.discord_user_id && reward.referred_discord_user_id === creator.discord_user_id) {
          summary.voided += 1;
          await updateReferralReward(env, reward.id, { status: 'VOID', status_reason: 'SELF_REFERRAL' }, REFERRAL_PRE_PAYOUT_STATUSES);
          await recordReferralEvent(env, { rewardId: reward.id, eventType: 'REFERRAL_VOIDED', details: { reason: 'SELF_REFERRAL' } });
          continue;
        }
      }
      if (await membershipEntitlementBlock(env, reward.referred_subscription_id)) throw referralSafetyFailure('REFERRED_MEMBERSHIP_BLOCKED', 'VOID');
      const payment = await qualifyingReferralCharge(env, reward);
      const profile = reward.creator_profile_id
        ? await creatorProfileForId(env, reward.creator_profile_id)
        : await referralProfileForDiscord(env, reward.referrer_discord_user_id);
      if (reward.creator_profile_id) await checkCreatorIdentity(env, reward, profile, payment.fingerprintHash);
      else await checkReferrerCardIdentity(env, reward, payment.fingerprintHash);
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
        const profilePath = reward.creator_profile_id
          ? `creator_referral_profiles?id=eq.${encodeURIComponent(profile.id)}`
          : `referral_profiles?discord_user_id=eq.${encodeURIComponent(profile.discord_user_id)}`;
        await supabase(env, profilePath, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: { payout_status: 'READY', updated_at: new Date().toISOString() },
        });
        await recordReferralEvent(env, { rewardId: reward.id, eventType: 'PAYOUT_RECIPIENT_READY', actorType: 'system', actorId: profile.id || profile.discord_user_id });
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

function memberWelcomeMessage(session, subscription, env) {
  const customerId = stripeId(session?.customer);
  if (!/^cs_(live|test)_[A-Za-z0-9_]+$/.test(session?.id || '')
      || session.mode !== 'subscription' || session.status !== 'complete'
      || !['paid', 'no_payment_required'].includes(session.payment_status)
      || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription?.status)
      || !customerId || customerId !== stripeId(subscription.customer)
      || stripeId(session.subscription) !== subscription.id) return null;
  if (session.payment_status === 'no_payment_required' && subscription.status !== 'trialing') return null;
  const email = String(session.customer_details?.email || '');
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email)) return null;
  const offer = session.metadata?.offer;
  if (offer !== subscription.metadata?.offer) return null;
  const plans = {
    starter: [env.STRIPE_MONTHLY_PRICE_ID, 3299, 1, 'Monthly membership — $10 first 7 days'],
    trial_2_day: [env.STRIPE_MONTHLY_PRICE_ID, 3299, 1, 'Monthly membership — 2 days free'],
    referral_trial: [env.STRIPE_MONTHLY_PRICE_ID, 3299, 1, 'Monthly membership — 2 days free'],
    six_month: [env.STRIPE_SIX_MONTH_PRICE_ID, 13499, 6, '6-month membership'],
    annual: [env.STRIPE_ANNUAL_PRICE_ID, 19499, 12, 'Annual membership'],
  };
  const plan = plans[offer];
  const items = subscription.items?.data;
  if (!plan?.[0] || items?.length !== 1 || items[0].quantity !== 1) return null;
  const price = items[0].price;
  const months = price?.recurring?.interval === 'year' ? Number(price.recurring.interval_count) * 12
    : price?.recurring?.interval === 'month' ? Number(price.recurring.interval_count) : null;
  if (price?.id !== plan[0] || price.currency !== 'usd' || price.unit_amount !== plan[1] || months !== plan[2]) return null;
  if (!Number.isSafeInteger(session.amount_total) || session.amount_total < 0 || session.currency !== 'usd') return null;
  const nextAt = subscription.status === 'trialing' ? subscription.trial_end
    : subscription.current_period_end || items[0].current_period_end;
  if (!Number.isFinite(nextAt) || nextAt <= Date.now() / 1000 || subscription.cancel_at_period_end || subscription.cancel_at) return null;
  const money = cents => '$' + (cents / 100).toFixed(2);
  const date = new Date(nextAt * 1000).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'long', day: 'numeric', year: 'numeric' });
  const connection = `${siteOrigin(env)}/join?checkout=success&session_id=${encodeURIComponent(session.id)}#connect-discord`;
  const automaticActivation = Boolean(session.metadata?.checkout_association_id);
  const period = months === 1 ? 'month' : months === 12 ? 'year' : '6 months';
  return {
    recipient: email,
    subject: 'Welcome to Kobe’s Betting Hub — connect your Discord',
    body: [
      'You’re in — welcome to Kobe’s Betting Hub!', '',
      'Plan: ' + plan[3],
      'Checkout total: ' + money(session.amount_total),
      `Next billing date: ${date} (Arizona time).`,
      `Standard renewal price: ${money(price.unit_amount)} every ${period}. Any applicable tax or discount is shown on your Stripe invoice.`,
      'Your subscription automatically renews unless canceled before the next billing date.', '',
      automaticActivation ? 'Your verified Discord account is being activated automatically.' : 'One more step to unlock the member channels:',
      automaticActivation ? 'Open your member dashboard to review access and billing status.' : 'Open your private checkout confirmation below, tap Connect Discord, and authorize the Discord account you want to use.',
      automaticActivation ? `${siteOrigin(env)}/member` : connection, '',
      'Already connected? Use that same Discord account in Kobe’s server. Do not buy another membership to fix missing access.',
      'Keep this connection link private — it belongs to your membership.', '',
      'Manage billing or cancel: ' + siteOrigin(env) + '/managemembership',
      'Need help connecting? Reply to this email or email zakai@kaimaz.com.', '',
      'For adults 21+ where permitted. No betting outcome is guaranteed. Wager responsibly.',
    ].join('\n'),
  };
}

async function queueMemberWelcome(env, event) {
  const start = Date.parse(env.MEMBER_WELCOME_START_AT || '');
  // Both provider creation times prevent old checkouts being mailed on a late retry.
  if (!Number.isFinite(start) || env.APP_ENV === 'staging' || event.livemode !== true
      || !Number.isFinite(event.created) || event.created * 1000 < start) return false;
  const original = event.data?.object;
  if (!original?.id || !/^cs_live_[A-Za-z0-9_]+$/.test(original.id)) return false;
  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(original.id)}`);
  if (!Number.isFinite(session.created) || session.created * 1000 < start
      || stripeId(session.customer) !== stripeId(original.customer)
      || stripeId(session.subscription) !== stripeId(original.subscription)) return false;
  const subscriptionId = stripeId(session.subscription);
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) return false;
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) || subscription.cancel_at_period_end || subscription.cancel_at) return false;
  if (await membershipEntitlementBlock(env, subscriptionId)) return false;
  const message = memberWelcomeMessage(session, subscription, env);
  if (!message) throw new Error('Member welcome terms require review.');
  await supabase(env, 'member_welcome_outbox?on_conflict=stripe_subscription_id', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { ...message, stripe_subscription_id: subscriptionId,
      stripe_checkout_session_id: session.id, stripe_customer_id: stripeId(session.customer) },
  });
  return true;
}

async function queuePaidAssociationWelcome(env, association, event, invoice) {
  const start = Date.parse(env.MEMBER_WELCOME_START_AT || '');
  if (!Number.isFinite(start) || env.APP_ENV === 'staging' || event.livemode !== true || event.created * 1000 < start) return false;
  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(association.stripe_checkout_session_id)}`);
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(association.stripe_subscription_id)}`);
  const message = memberWelcomeMessage({ ...session, payment_status: 'paid', amount_total: Number(invoice.amount_paid), currency: invoice.currency }, subscription, env);
  if (!message) return false;
  await supabase(env, 'member_welcome_outbox?on_conflict=stripe_subscription_id', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { ...message, stripe_subscription_id: subscription.id, stripe_checkout_session_id: session.id, stripe_customer_id: stripeId(session.customer) },
  });
  return true;
}

async function queueLifecycleReminders(env) {
  const now = Date.now();
  const subscriptions = await supabase(env, 'membership_subscriptions?status=in.(active,trialing)&select=*&limit=1000');
  const associations = await supabase(env, 'membership_checkout_associations?status=in.(PAYMENT_CONFIRMED,VIP_PENDING,VIP_FAILED)&select=*&limit=1000');
  let queued = 0;
  const enqueue = async ({ dedupeKey, subscriptionId, customerId, emailType, recipient, subject, body }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient || '')) return;
    await supabase(env, 'member_lifecycle_outbox?on_conflict=dedupe_key', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { dedupe_key: dedupeKey, stripe_subscription_id: subscriptionId, stripe_customer_id: customerId, email_type: emailType, recipient, subject, body } });
    queued += 1;
  };
  for (const subscription of subscriptions || []) {
    if (subscription.offer !== 'starter' || subscription.cancel_at_period_end || subscription.cancel_at) continue;
    const ends = new Date(subscription.current_period_end).getTime();
    if (!Number.isFinite(ends) || ends - now < 0 || ends - now > 2 * 86400000) continue;
    try {
      const customer = await stripeGet(env, `/customers/${encodeURIComponent(subscription.stripe_customer_id)}`);
      await enqueue({ dedupeKey: `intro-expiring:${subscription.stripe_subscription_id}:${subscription.current_period_end}`, subscriptionId: subscription.stripe_subscription_id, customerId: subscription.stripe_customer_id, emailType: 'INTRO_EXPIRING', recipient: customer.email, subject: 'Your Kobe’s VIP intro period renews soon', body: `Your $10 introductory period renews at the standard $32.99 monthly price on ${new Date(ends).toLocaleDateString('en-US',{timeZone:'America/Phoenix'})}. No action is needed to continue. Manage or cancel securely at ${siteOrigin(env)}/managemembership. We never subscribe you to a different plan without your authorization.` });
    } catch { /* A reminder must never disrupt membership reconciliation. */ }
  }
  for (const association of associations || []) {
    if (!association.stripe_customer_id || !association.stripe_subscription_id || association.status === 'VIP_ACTIVE') continue;
    try {
      const customer = await stripeGet(env, `/customers/${encodeURIComponent(association.stripe_customer_id)}`);
      await enqueue({ dedupeKey: `access-incomplete:${association.stripe_subscription_id}`, subscriptionId: association.stripe_subscription_id, customerId: association.stripe_customer_id, emailType: 'INCOMPLETE_ONBOARDING', recipient: customer.email, subject: 'Your payment is safe — finish Kobe’s VIP access', body: `Your Kobe’s Betting Hub payment is confirmed, but Discord access still needs attention. Do not purchase again. Sign in at ${siteOrigin(env)}/member with the Discord account used at checkout, or contact support@kobesbettinghub.com and include your checkout email.` });
    } catch { /* Retain operational alert; do not leak customer details. */ }
  }
  return { queued };
}

async function handleMemberWelcomeQueue(request, env) {
  const expected = String(env.MEMBER_WELCOME_QUEUE_SECRET || '');
  if (!expected || !await secureEqual(request.headers.get('authorization') || '', `Bearer ${expected}`)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const path = new URL(request.url).pathname;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (request.method === 'GET' && path === '/ops/member-welcomes') {
      // List identities only. Content is returned once, after an atomic claim.
      const [welcome, lifecycle] = await Promise.all([
        supabase(env, 'member_welcome_outbox?status=eq.QUEUED&select=id,created_at&order=created_at.asc&limit=10'),
        supabase(env, 'member_lifecycle_outbox?status=eq.QUEUED&select=id,created_at&order=created_at.asc&limit=10'),
      ]);
      return reply({ notifications: [...(welcome || []), ...(lifecycle || [])].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).slice(0,10).map(({id})=>({id})) });
    }
    if (request.method !== 'POST' || !['/ops/member-welcomes/claim', '/ops/member-welcomes/deliver', '/ops/member-welcomes/hold'].includes(path)) return reply({ error: 'Not found.' }, 404);
    const data = JSON.parse(await readTextWithLimit(request, 1000));
    const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
    if (!uuid(data.id)) return reply({ error: 'Invalid notification.' }, 400);
    if (path.endsWith('/claim')) {
      const token = crypto.randomUUID();
      let row = null;
      for (const table of ['member_welcome_outbox','member_lifecycle_outbox']) {
        const rows = await supabase(env, `${table}?id=eq.${data.id}&status=eq.QUEUED`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'SEND_STARTED', claim_token: token, send_started_at: new Date().toISOString() } });
        if (rows?.[0]) { row = rows[0]; break; }
      }
      if (!row) return reply({ error: 'Already claimed.' }, 409);
      return reply({ id: row.id, claimToken: token, recipient: row.recipient, subject: row.subject, body: row.body });
    }
    if (!uuid(data.claimToken)) return reply({ error: 'Invalid claim.' }, 400);
    const delivered = path.endsWith('/deliver');
    let acknowledged = false;
    for (const table of ['member_welcome_outbox','member_lifecycle_outbox']) {
      const rows = await supabase(env, `${table}?id=eq.${data.id}&claim_token=eq.${data.claimToken}&status=eq.SEND_STARTED`, { method: 'PATCH', prefer: 'return=representation', body: { status: delivered ? 'DELIVERED' : 'REVIEW_REQUIRED', ...(delivered ? { delivered_at: new Date().toISOString() } : {}) } });
      if (rows?.length) { acknowledged = true; break; }
    }
    if (!acknowledged) return reply({ error: 'Claim cannot be acknowledged.' }, 409);
    return reply({ ok: true });
  } catch {
    // Never leak customer addresses, private links, or credentials into responses/logs.
    console.error(JSON.stringify({ message: 'Member welcome queue operation failed', path }));
    return reply({ error: 'Notification operation failed safely.' }, 503);
  }
}

async function activateCheckoutAssociation(env, association, eventId = null) {
  if (!association?.discord_user_id || !association.stripe_checkout_session_id) throw new Error('Verified checkout identity is missing.');
  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(association.stripe_checkout_session_id)}`);
  if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) throw new Error('Stripe payment is not eligible.');
  if (session.metadata?.checkout_association_id !== association.id || !session.subscription) throw new Error('Checkout association does not match Stripe.');
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(stripeId(session.subscription))}`);
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) throw new Error('Stripe subscription is not eligible.');
  let successfulPayment = session.payment_status === 'paid' && Number(session.amount_total || 0) > 0;
  if (!successfulPayment && subscription.latest_invoice) {
    const invoice = await stripeGet(env, `/invoices/${encodeURIComponent(stripeId(subscription.latest_invoice))}`);
    successfulPayment = invoice.status === 'paid' && Number(invoice.amount_paid || 0) > 0;
  }
  if (!successfulPayment) throw new Error('An authoritative successful Stripe payment is required before VIP activation.');
  const customerId = stripeId(session.customer) || stripeId(subscription.customer);
  const attempts = Number(association.activation_attempts || 0) + 1;
  await updateCheckoutAssociation(env, association.id, {
    status: 'VIP_PENDING', stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id, activation_attempts: attempts,
    last_activation_attempt_at: new Date().toISOString(), last_error_code: null,
  });
  try {
    await claimDiscordLink(env, customerId, subscription.id, association.discord_user_id);
    const updated = await stripe(env, `/subscriptions/${encodeURIComponent(subscription.id)}`, {
      'metadata[discord_user_id]': association.discord_user_id,
      'metadata[discord_connected_at]': new Date().toISOString(),
      'metadata[checkout_association_id]': association.id,
    }, { idempotencyKey: `link-${association.id}` });
    await persistSubscription(env, updated, eventId);
    if (await membershipEntitlementBlock(env, subscription.id)) throw new Error('Membership entitlement is blocked.');
    await grantMemberRole(association.discord_user_id, env);
    await updateCheckoutAssociation(env, association.id, { status: 'VIP_ACTIVE', next_retry_at: null, last_error_code: null });
    await recordMembershipEvent(env, {
      eventType: 'VIP_ACTIVATED', actorType: eventId ? 'stripe_webhook' : 'membership_reconciliation', actorId: eventId,
      customerId, subscriptionId: subscription.id, discordUserId: association.discord_user_id,
      details: { checkout_association_id: association.id, activation_attempt: attempts },
    });
    await recordAnalyticsEvent(env, {
      eventName: 'payment_completed', sessionId: association.analytics_session_id, offer: association.offer,
      customerId, subscriptionId: subscription.id, discordUserId: association.discord_user_id,
      dedupeKey: `payment_completed:${subscription.id}`,
    });
    await recordAnalyticsEvent(env, {
      eventName: 'vip_activated', sessionId: association.analytics_session_id, offer: association.offer,
      customerId, subscriptionId: subscription.id, discordUserId: association.discord_user_id,
      dedupeKey: `vip_activated:${subscription.id}`,
    });
    return 'VIP_ACTIVE';
  } catch (error) {
    const code = safeActivationError(error);
    const delayMinutes = attempts === 1 ? 2 : attempts === 2 ? 10 : 60;
    await updateCheckoutAssociation(env, association.id, {
      status: attempts >= 3 ? 'VIP_FAILED' : 'VIP_PENDING', last_error_code: code,
      next_retry_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
    });
    await recordAnalyticsEvent(env, {
      eventName: 'payment_completed', sessionId: association.analytics_session_id, offer: association.offer,
      customerId, subscriptionId: subscription.id, discordUserId: association.discord_user_id,
      dedupeKey: `payment_completed:${subscription.id}`,
    });
    await recordAnalyticsEvent(env, {
      eventName: 'vip_activation_failed', sessionId: association.analytics_session_id, offer: association.offer,
      customerId, subscriptionId: subscription.id, discordUserId: association.discord_user_id,
      dedupeKey: `vip_activation_failed:${subscription.id}:${attempts}`, properties: { error_code: code, attempt: attempts },
    });
    throw error;
  }
}

async function onboardingStatus(request, env, origin) {
  const token = new URL(request.url).searchParams.get('state') || '';
  const association = await checkoutAssociationByToken(env, token);
  if (!association) return json({ error: 'That welcome link is invalid.' }, 404, origin);
  const expired = new Date(association.expires_at).getTime() <= Date.now() && !['PAYMENT_CONFIRMED','VIP_PENDING','VIP_ACTIVE','VIP_FAILED'].includes(association.status);
  if (expired) return json({ state: 'expired' }, 410, origin);
  const state = association.status === 'VIP_ACTIVE' ? 'active'
    : association.status === 'VIP_FAILED' ? 'failed'
      : ['PAYMENT_CONFIRMED', 'VIP_PENDING'].includes(association.status) ? 'processing'
        : association.status === 'CHECKOUT_STARTED' ? 'awaiting_payment' : 'verifying';
  return json({ state, paymentConfirmed: ['PAYMENT_CONFIRMED','VIP_PENDING','VIP_ACTIVE','VIP_FAILED'].includes(association.status), discordConnected: Boolean(association.discord_user_id), vipActive: association.status === 'VIP_ACTIVE', retryAvailable: ['VIP_PENDING','VIP_FAILED'].includes(association.status), errorCode: association.last_error_code || null }, 200, origin);
}

async function retryOnboarding(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  const association = await checkoutAssociationByToken(env, data.state || '');
  if (!association || !['VIP_PENDING','VIP_FAILED','PAYMENT_CONFIRMED'].includes(association.status)) return json({ error: 'This activation cannot be retried.' }, 403, origin);
  try { await activateCheckoutAssociation(env, association); return json({ ok: true }, 200, origin); }
  catch { return json({ error: 'Your payment is safe, but Discord activation still needs attention. You do not need to purchase again.' }, 503, origin); }
}

async function retryPendingActivations(env) {
  const now = new Date().toISOString();
  const rows = await supabase(env, `membership_checkout_associations?status=in.(VIP_PENDING,VIP_FAILED)&next_retry_at=lte.${encodeURIComponent(now)}&select=*&order=next_retry_at.asc&limit=25`);
  const summary = { checked: 0, activated: 0, failed: 0 };
  for (const association of rows || []) {
    summary.checked += 1;
    try { await activateCheckoutAssociation(env, association); summary.activated += 1; }
    catch { summary.failed += 1; }
  }
  return summary;
}

async function collectAnalytics(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  if (!['page_view','join_page_view'].includes(data.event_name) || !/^[0-9a-f-]{36}$/i.test(data.session_id || '')) return json({ error: 'Invalid analytics event.' }, 400, origin);
  const attribution = requestAttribution(request, data.attribution);
  await supabase(env, 'analytics_sessions?on_conflict=id', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: { id: data.session_id, first_path: String(data.path || '/').slice(0, 300), first_referrer_host: attribution.referrer_host || null, first_touch: attribution, last_touch: attribution, last_seen_at: new Date().toISOString() },
  });
  await supabase(env, `analytics_sessions?id=eq.${encodeURIComponent(data.session_id)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { last_touch: attribution, last_seen_at: new Date().toISOString() },
  });
  await recordAnalyticsEvent(env, { eventName: data.event_name, sessionId: data.session_id, path: String(data.path || '/').slice(0, 300), dedupeKey: data.dedupe_key || null });
  return json({ ok: true }, 202, origin);
}

async function readAdminSession(request, env) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [body, signature, ...extra] = token.split('.');
  if (!body || !signature || extra.length || !await secureEqual(await sign(body, env.DISCORD_OAUTH_STATE_SECRET), signature)) return null;
  try {
    const value = JSON.parse(decode.decode(fromBase64Url(body)));
    const allowed = new Set(String(env.ADMIN_DISCORD_USER_IDS || '').split(',').map(item => item.trim()).filter(Boolean));
    return value.purpose === 'admin' && value.expiresAt >= Math.floor(Date.now() / 1000) && allowed.has(value.discordUserId) ? value : null;
  } catch { return null; }
}

async function readMemberSession(request, env) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [body, signature, ...extra] = token.split('.');
  if (!body || !signature || extra.length || !await secureEqual(await sign(body, env.DISCORD_OAUTH_STATE_SECRET), signature)) return null;
  try {
    const value = JSON.parse(decode.decode(fromBase64Url(body)));
    return value.purpose === 'member' && value.expiresAt >= Math.floor(Date.now() / 1000) && /^\d{10,25}$/.test(value.discordUserId) ? value : null;
  } catch { return null; }
}

async function memberDashboard(request, env, origin) {
  const auth = await readMemberSession(request, env);
  if (!auth) return json({ error: 'Member sign-in required.' }, 401, origin);
  const membership = await membershipCustomerForDiscord(env, auth.discordUserId);
  if (!membership?.current_subscription_id) return json({ error: 'No connected membership was found.' }, 404, origin);
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(membership.current_subscription_id)}`);
  const profile = await referralProfileForDiscord(env, auth.discordUserId);
  const rewards = profile ? await supabase(env, `referral_rewards?referrer_discord_user_id=eq.${encodeURIComponent(auth.discordUserId)}&select=status,reward_amount_cents&limit=500`) : [];
  const entitled = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) && !await membershipEntitlementBlock(env, subscription.id);
  return json({
    plan: subscription.metadata?.offer || 'membership', status: subscription.status,
    entitled, discordConnected: true, vipStatus: entitled ? 'active' : 'inactive',
    renewsOrEndsAt: stripeTimestamp(subscription.cancel_at || subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end),
    scheduledToCancel: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    referral: profile ? { code: profile.referral_code, pending: (rewards || []).filter(item => !['PAYOUT_SENT','VOID'].includes(item.status)).length, paidCents: (rewards || []).filter(item => item.status === 'PAYOUT_SENT').reduce((sum, item) => sum + Number(item.reward_amount_cents || 0), 0) } : null,
  }, 200, origin);
}

async function saveCancellationFeedback(request, env, origin) {
  const auth = await readMemberSession(request, env);
  if (!auth) return json({ error: 'Member sign-in required.' }, 401, origin);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  const allowed = new Set(['price','not_using','results','technical','billing','community','other']);
  if (!allowed.has(data.reason)) return json({ error: 'Choose a cancellation reason.' }, 400, origin);
  const membership = await membershipCustomerForDiscord(env, auth.discordUserId);
  if (!membership?.current_subscription_id) return json({ error: 'No connected membership was found.' }, 404, origin);
  await supabase(env, 'cancellation_feedback', { method: 'POST', prefer: 'return=minimal', body: {
    stripe_subscription_id: membership.current_subscription_id, discord_user_id: auth.discordUserId,
    reason_code: data.reason, reason_text: String(data.details || '').slice(0, 500) || null,
    retention_offer_shown: Boolean(data.retentionOfferShown), retention_offer_accepted: false,
  } });
  return json({ ok: true }, 201, origin);
}

function analyticsRange(url) {
  const now = new Date();
  const preset = url.searchParams.get('range') || '30d';
  let start = null; let end = now;
  if (preset === 'today') start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  else if (preset === 'yesterday') { end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); start = new Date(end.getTime() - 86400000); }
  else if (preset === '7d') start = new Date(now.getTime() - 7 * 86400000);
  else if (preset === '30d') start = new Date(now.getTime() - 30 * 86400000);
  else if (preset === 'custom') {
    start = new Date(url.searchParams.get('start') || 'invalid');
    end = new Date(url.searchParams.get('end') || 'invalid');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() - start.getTime() > 366 * 86400000) throw new Error('Invalid analytics date range.');
  } else if (preset !== 'all') throw new Error('Invalid analytics range.');
  return { preset, start, end, includes: value => { const time = new Date(value).getTime(); return Number.isFinite(time) && (!start || time >= start.getTime()) && time < end.getTime(); } };
}

function groupCount(values, key) {
  return values.reduce((out, value) => { const label = key(value) || 'Unknown'; out[label] = (out[label] || 0) + 1; return out; }, {});
}

async function adminAnalytics(request, env, origin) {
  if (!await readAdminSession(request, env)) return json({ error: 'Admin sign-in required.' }, 401, origin);
  let range;
  try { range = analyticsRange(new URL(request.url)); } catch (error) { return json({ error: error.message }, 400, origin); }
  let paidInvoices = [];
  let stripePaymentsTruncated = false;
  try {
    let cursor = '';
    for (let page = 0; page < 20; page += 1) {
      const invoicePage = await stripeGet(env, `/invoices?status=paid&limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
      const batch = Array.isArray(invoicePage?.data) ? invoicePage.data : [];
      paidInvoices.push(...batch);
      stripePaymentsTruncated = Boolean(invoicePage?.has_more);
      if (!stripePaymentsTruncated) break;
      cursor = batch.at(-1)?.id || '';
      if (!cursor) break;
    }
  } catch { paidInvoices = []; stripePaymentsTruncated = true; /* The durable billing ledger remains the safe fallback. */ }
  let successfulCharges = [];
  if (!paidInvoices.length) {
    try {
      let cursor = '';
      for (let page = 0; page < 20; page += 1) {
        const chargePage = await stripeGet(env, `/charges?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
        const batch = Array.isArray(chargePage?.data) ? chargePage.data : [];
        successfulCharges.push(...batch.filter(item => item.paid && item.status === 'succeeded' && !item.refunded));
        stripePaymentsTruncated = Boolean(chargePage?.has_more);
        if (!stripePaymentsTruncated) break;
        cursor = batch.at(-1)?.id || '';
        if (!cursor) break;
      }
    } catch { successfulCharges = []; stripePaymentsTruncated = true; /* The durable billing ledger remains the safe fallback. */ }
  }
  const stripePayments = paidInvoices.length
    ? paidInvoices.map(item => ({ created: item.created, amountPaid: Number(item.amount_paid || 0), subscriptionId: invoiceSubscriptionId(item), customerId: stripeId(item.customer) }))
    : successfulCharges.map(item => ({ created: item.created, amountPaid: Number(item.amount_captured || item.amount || 0), subscriptionId: '', customerId: stripeId(item.customer) }));
  let freePick = null;
  try {
    const response = await fetch('https://bettinghub-publisher.kobedirwin.workers.dev/api/free-pick/current', { signal: AbortSignal.timeout(8_000) });
    if (response.ok) freePick = await response.json();
  } catch { /* Dashboard shows unavailable without blocking business metrics. */ }
  const [sessionPage, eventPage, subscriptionPage, customerPage, associationPage, billingPage, referralPage, profilePage, creatorPage, feedbackPage, webhookPage] = await Promise.all([
    supabasePages(env, 'analytics_sessions?select=*&order=started_at.desc,id.desc'),
    supabasePages(env, 'analytics_events?select=*&order=occurred_at.desc,id.desc'),
    supabasePages(env, 'membership_subscriptions?select=*&order=updated_at.desc,stripe_subscription_id.desc'),
    supabasePages(env, 'membership_customers?select=stripe_customer_id,discord_user_id,current_subscription_id&order=stripe_customer_id.asc'),
    supabasePages(env, 'membership_checkout_associations?select=id,offer,referral_code,attribution,analytics_session_id,discord_user_id,stripe_subscription_id,status,activation_attempts,last_activation_attempt_at,last_error_code,next_retry_at,created_at&order=created_at.desc,id.desc'),
    supabasePages(env, 'membership_billing_events?select=*&order=occurred_at.desc,stripe_event_id.desc'),
    supabasePages(env, 'referral_rewards?select=referrer_discord_user_id,creator_profile_id,status,reward_amount_cents,created_at,first_paid_at&order=created_at.desc,id.desc'),
    supabasePages(env, 'referral_profiles?select=discord_user_id,referral_code,payout_status&order=discord_user_id.asc'),
    supabasePages(env, 'creator_referral_profiles?select=id,display_name,referral_code,discord_user_id,trial_expires_at,status,payout_status&order=id.asc'),
    supabasePages(env, 'cancellation_feedback?select=reason_code,retention_offer_shown,retention_offer_accepted,created_at&order=created_at.desc,id.desc'),
    supabasePages(env, 'stripe_webhook_events?status=eq.FAILED&select=event_id,event_type,error_detail,received_at&order=received_at.desc,event_id.desc', { pageSize: 100 }),
  ]);
  const [sessions, events, subscriptions, customers, associations, billing, referrals, profiles, creators, feedback, webhooks] = [sessionPage, eventPage, subscriptionPage, customerPage, associationPage, billingPage, referralPage, profilePage, creatorPage, feedbackPage, webhookPage].map(page => page.rows);
  const rangedSessions = (sessions || []).filter(item => range.includes(item.started_at));
  const dataCompletenessWarnings = [
    sessionPage.truncated && 'Visitor/source history may be incomplete (20,000-row safety limit).',
    eventPage.truncated && 'Conversion/event history may be incomplete (20,000-row safety limit).',
    billingPage.truncated && 'Billing history may be incomplete (20,000-row safety limit).',
    [subscriptionPage, customerPage, associationPage, referralPage, profilePage, creatorPage, feedbackPage, webhookPage].some(page => page.truncated) && 'Some member, referral, or alert history may be incomplete (pagination safety limit).',
    stripePaymentsTruncated && 'Stripe payment totals may be incomplete (2,000-invoice/charge safety limit).',
  ].filter(Boolean);
  const rangedEvents = (events || []).filter(item => range.includes(item.occurred_at));
  const rangedBilling = (billing || []).filter(item => range.includes(item.occurred_at));
  const rangedReferrals = (referrals || []).filter(item => range.includes(item.created_at));
  const rangedFeedback = (feedback || []).filter(item => range.includes(item.created_at));
  const countEvents = name => rangedEvents.filter(event => event.event_name === name).length;
  const eligible = (subscriptions || []).filter(item => ACTIVE_SUBSCRIPTION_STATUSES.has(item.status) && !item.entitlement_blocked);
  const mappedEligible = eligible.map(subscription => ({ subscription, customer: (customers || []).find(item => item.stripe_customer_id === subscription.stripe_customer_id) }));
  const roleChecks = await Promise.all(mappedEligible.map(async item => {
    if (!item.customer?.discord_user_id) return { ...item, role: 'MISSING_DISCORD' };
    try {
      const member = await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${item.customer.discord_user_id}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }, env, { memberId: item.customer.discord_user_id, triggerType: 'admin_access_health' });
      return { ...item, role: member?.roles?.includes(env.DISCORD_MEMBER_ROLE_ID) ? 'ACTIVE' : 'MISSING' };
    } catch { return { ...item, role: 'CHECK_FAILED' }; }
  }));
  let vipWithoutEntitlement = null;
  try {
    const vipMembers = [];
    let after = '';
    for (let page = 0; page < 5; page += 1) {
      const query = new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) });
      const members = await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members?${query}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }, env, { triggerType: 'admin_access_health' });
      const current = Array.isArray(members) ? members : [];
      vipMembers.push(...current.filter(member => member.roles?.includes(env.DISCORD_MEMBER_ROLE_ID)).map(member => member.user?.id).filter(Boolean));
      if (current.length < 1000) break;
      after = current.at(-1)?.user?.id || '';
      if (!after) break;
    }
    const entitledDiscordIds = new Set(mappedEligible.map(item => item.customer?.discord_user_id).filter(Boolean));
    for (const creator of creators || []) {
      if (creator.discord_user_id && creator.trial_expires_at && Date.parse(creator.trial_expires_at) > Date.now()) entitledDiscordIds.add(creator.discord_user_id);
    }
    vipWithoutEntitlement = vipMembers.filter(id => !entitledDiscordIds.has(id)).length;
  } catch { /* Surface unavailable rather than inventing a zero. */ }
  const activeIds = new Set(roleChecks.filter(item => item.role === 'ACTIVE').map(item => item.subscription.stripe_subscription_id));
  const paidWithoutVip = roleChecks.filter(item => item.role !== 'ACTIVE').map(item => item.subscription);
  const paidWithoutVipDetails = paidWithoutVip.map(subscription => {
    const association = (associations || []).find(item => item.stripe_subscription_id === subscription.stripe_subscription_id);
    return {
      associationId: association?.id || null, plan: subscription.offer || 'unknown', entitlementStatus: subscription.status,
      subscriptionId: subscription.stripe_subscription_id,
      discordConnected: Boolean((customers || []).find(item => item.stripe_customer_id === subscription.stripe_customer_id)?.discord_user_id), vipStatus: association?.status || roleChecks.find(item => item.subscription.stripe_subscription_id === subscription.stripe_subscription_id)?.role || 'DISCORD_MISSING',
      activationAttempts: association?.activation_attempts || 0, lastAttempt: association?.last_activation_attempt_at || null,
      failureReason: association?.last_error_code || null, retryAt: association?.next_retry_at || null,
    };
  });
  const invoiceWithinRange = stripePayments.filter(item => range.includes(new Date(Number(item.created || 0) * 1000).toISOString()));
  const collected = stripePayments.length
    ? invoiceWithinRange.reduce((sum, item) => sum + item.amountPaid, 0)
    : rangedBilling.filter(item => item.event_type === 'invoice_paid').reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const refunds = rangedBilling.filter(item => item.event_type === 'refund').reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const paidSince = start => stripePayments.length
    ? stripePayments.filter(item => Number(item.created || 0) * 1000 >= start).reduce((sum, item) => sum + item.amountPaid, 0)
    : (billing || []).filter(item => item.event_type === 'invoice_paid' && new Date(item.occurred_at).getTime() >= start).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const currentDate = new Date();
  const startOfDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
  const startOfWeek = startOfDay - ((currentDate.getDay() + 6) % 7) * 86400000;
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
  const allTimeRevenue = stripePayments.length
    ? stripePayments.reduce((sum, item) => sum + item.amountPaid, 0)
    : (billing || []).filter(item => item.event_type === 'invoice_paid').reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const mrr = eligible.reduce((sum, item) => sum + (item.offer === 'annual' ? 19499 / 12 : item.offer === 'six_month' ? 13499 / 6 : 3299), 0);
  const funnelNames = ['unique_visitor','join_page_view','offer_selected','discord_verified','checkout_started','payment_completed','vip_activated'];
  const funnel = funnelNames.map((name, index) => {
    const count = name === 'unique_visitor' ? rangedSessions.length : countEvents(name);
    const previous = index ? (funnelNames[index - 1] === 'unique_visitor' ? rangedSessions.length : countEvents(funnelNames[index - 1])) : count;
    return { name, count, previousConversionRate: previous ? count / previous : 0, overallConversionRate: rangedSessions.length ? count / rangedSessions.length : 0, dropoff: Math.max(0, previous - count), dropoffRate: previous ? Math.max(0, previous - count) / previous : 0 };
  });
  const sessionById = new Map((sessions || []).map(item => [item.id, item]));
  const associationBySubscription = new Map((associations || []).filter(item => item.stripe_subscription_id).map(item => [item.stripe_subscription_id, item]));
  const normalizedSource = value => cleanAttribution({ first_source: value }).first_source;
  const firstSourceForSession = session => normalizedSource(session?.first_touch?.first_source || session?.first_touch?.utm_source || session?.first_referrer_host || 'direct');
  const firstCampaignForSession = session => String(session?.first_touch?.first_campaign || session?.first_touch?.utm_campaign || 'uncategorized').toLowerCase();
  const sessionForSubscription = subscriptionId => sessionById.get(associationBySubscription.get(subscriptionId)?.analytics_session_id);
  const mrrForSubscription = subscription => subscription.offer === 'annual' ? Math.round(19499 / 12) : subscription.offer === 'six_month' ? Math.round(13499 / 6) : 3299;
  const revenueForSubscription = subscriptionId => {
    const exact = invoiceWithinRange.filter(item => item.subscriptionId === subscriptionId);
    if (exact.length) return exact.reduce((sum, item) => sum + item.amountPaid, 0);
    return rangedBilling.filter(item => item.stripe_subscription_id === subscriptionId && item.event_type === 'invoice_paid').reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  };
  const sourceRows = new Map(); const campaignRows = new Map();
  const ensureSource = source => { if (!sourceRows.has(source)) sourceRows.set(source, { source, visitors: 0, joinViews: 0, checkoutStarts: 0, purchases: 0, revenueCents: 0, mrrCents: 0 }); return sourceRows.get(source); };
  const ensureCampaign = (source, campaign) => { const key = `${source}:${campaign}`; if (!campaignRows.has(key)) campaignRows.set(key, { source, campaign, visitors: 0, joinViews: 0, checkoutStarts: 0, purchases: 0, revenueCents: 0, mrrCents: 0 }); return campaignRows.get(key); };
  for (const session of rangedSessions) {
    const source = firstSourceForSession(session); const campaign = firstCampaignForSession(session);
    ensureSource(source).visitors += 1; ensureCampaign(source, campaign).visitors += 1;
  }
  for (const event of rangedEvents) {
    const session = sessionById.get(event.session_id); const source = firstSourceForSession(session); const campaign = firstCampaignForSession(session);
    const row = ensureSource(source); const campaignRow = ensureCampaign(source, campaign);
    if (event.event_name === 'join_page_view') { row.joinViews += 1; campaignRow.joinViews += 1; }
    if (event.event_name === 'checkout_started') { row.checkoutStarts += 1; campaignRow.checkoutStarts += 1; }
    if (event.event_name === 'payment_completed') {
      const paid = revenueForSubscription(event.stripe_subscription_id);
      row.purchases += 1; row.revenueCents += paid; campaignRow.purchases += 1; campaignRow.revenueCents += paid;
    }
  }
  for (const subscription of eligible) {
    const session = sessionForSubscription(subscription.stripe_subscription_id); const source = firstSourceForSession(session); const campaign = firstCampaignForSession(session); const amount = mrrForSubscription(subscription);
    ensureSource(source).mrrCents += amount; ensureCampaign(source, campaign).mrrCents += amount;
  }
  const sources = [...sourceRows.values()].map(item => ({ ...item, conversionRate: item.visitors ? item.purchases / item.visitors : 0 })).sort((a,b) => b.visitors - a.visitors);
  const campaigns = [...campaignRows.values()].map(item => ({ ...item, conversionRate: item.visitors ? item.purchases / item.visitors : 0 })).sort((a,b) => b.revenueCents - a.revenueCents || b.visitors - a.visitors);
  const referralStatus = status => rangedReferrals.filter(item => item.status === status).length;
  const canceled = (subscriptions || []).filter(item => item.status === 'canceled');
  const ageAtEndDays = item => (new Date(item.updated_at).getTime() - new Date(item.created_at).getTime()) / 86400000;
  const now = Date.now();
  const phoenixDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' });
  const phoenixDay = value => {
    const parts = phoenixDateFormat.formatToParts(new Date(value));
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const todayPhoenix = phoenixDay(now);
  const last7Start = now - 7 * 86400000;
  const cancellationTrackingStart = Date.parse('2026-09-23T07:00:00Z');
  const cancellationTodayComplete = now >= cancellationTrackingStart;
  const cancellationLast7Complete = last7Start >= cancellationTrackingStart;
  if (!range.start || range.start.getTime() < cancellationTrackingStart) dataCompletenessWarnings.push('Cancellation event history before Sep 23, 2026 is unavailable; do not interpret it as zero.');
  let newPaidToday = 0, cancelledToday = 0, newPaidLast7 = 0, cancelledLast7 = 0;
  for (const item of events || []) {
    if (!['payment_completed', 'cancellation_completed'].includes(item.event_name)) continue;
    const occurredAt = new Date(item.occurred_at).getTime();
    if (!Number.isFinite(occurredAt) || occurredAt < last7Start) continue;
    const paid = item.event_name === 'payment_completed';
    if (paid) newPaidLast7 += 1; else cancelledLast7 += 1;
    if (phoenixDay(occurredAt) === todayPhoenix) {
      if (paid) newPaidToday += 1; else cancelledToday += 1;
    }
  }
  const activeAges = eligible.map(item => (now - new Date(item.created_at).getTime()) / 86400000);
  const durations = [...activeAges, ...canceled.map(ageAtEndDays)].filter(Number.isFinite);
  const dayKey = value => new Date(value).toISOString().slice(0, 10);
  const historyMap = new Map();
  for (let offset = 89; offset >= 0; offset -= 1) { const date = new Date(now - offset * 86400000).toISOString().slice(0,10); historyMap.set(date, { date, newMembers: 0, payments: 0, renewals: 0, cancellations: 0, failedPayments: 0, revenueCents: 0 }); }
  for (const event of events || []) { const row = historyMap.get(dayKey(event.occurred_at)); if (row && event.event_name === 'payment_completed') row.newMembers += 1; if (row && event.event_name === 'cancellation_completed') row.cancellations += 1; }
  for (const item of billing || []) { const row = historyMap.get(dayKey(item.occurred_at)); if (!row) continue; if (item.event_type === 'invoice_paid') { row.payments += 1; row.revenueCents += Number(item.amount_cents || 0); if (item.billing_reason === 'subscription_cycle') row.renewals += 1; } if (item.event_type === 'invoice_failed') row.failedPayments += 1; }
  const profileByDiscord = new Map((profiles || []).map(item => [item.discord_user_id, item]));
  const creatorById = new Map((creators || []).map(item => [item.id, item]));
  const leaderboardMap = new Map();
  for (const reward of referrals || []) { const id = reward.creator_profile_id ? `creator:${reward.creator_profile_id}` : reward.referrer_discord_user_id || 'unknown'; const creator = creatorById.get(reward.creator_profile_id); if (!leaderboardMap.has(id)) leaderboardMap.set(id, { discordUserId: reward.referrer_discord_user_id || '', referrerName: creator?.display_name || reward.referrer_discord_user_id || 'Unknown', referralCode: creator?.referral_code || profileByDiscord.get(id)?.referral_code || '', successfulReferrals: 0, pendingReferrals: 0, totalEarnedCents: 0 }); const row = leaderboardMap.get(id); if (['READY','PAYOUT_SENT'].includes(reward.status)) row.successfulReferrals += 1; else if (!['VOID'].includes(reward.status)) row.pendingReferrals += 1; if (reward.status === 'PAYOUT_SENT') row.totalEarnedCents += Number(reward.reward_amount_cents || 0); }
  const stripeProfiles = await Promise.all((customers || []).slice(0, 250).map(async customer => {
    try { const stripeCustomer = await stripeGet(env, `/customers/${encodeURIComponent(customer.stripe_customer_id)}`); return [customer.stripe_customer_id, { name: stripeCustomer.name || '', email: stripeCustomer.email || '' }]; }
    catch { return [customer.stripe_customer_id, { name: '', email: '' }]; }
  }));
  const stripeProfileMap = new Map(stripeProfiles);
  const baseMembers = (subscriptions || []).map(subscription => {
    const customer = (customers || []).find(item => item.stripe_customer_id === subscription.stripe_customer_id); const identity = stripeProfileMap.get(subscription.stripe_customer_id) || {};
    const association = associationBySubscription.get(subscription.stripe_subscription_id); const analyticsSession = sessionById.get(association?.analytics_session_id); const firstTouch = analyticsSession?.first_touch || association?.attribution || {}; const lastTouch = analyticsSession?.last_touch || association?.attribution || {};
    const memberRewards = (referrals || []).filter(item => item.referrer_discord_user_id === customer?.discord_user_id); const purchase = (billing || []).filter(item => item.stripe_subscription_id === subscription.stripe_subscription_id && item.event_type === 'invoice_paid').sort((a,b) => new Date(a.occurred_at) - new Date(b.occurred_at))[0];
    return { name: identity.name, email: identity.email, plan: subscription.offer || 'unknown', status: subscription.status, stripeCustomerId: subscription.stripe_customer_id, subscriptionId: subscription.stripe_subscription_id, discordUserId: customer?.discord_user_id || '', vipStatus: association?.status || 'UNKNOWN', joinedAt: subscription.created_at, purchaseAt: purchase?.occurred_at || null, renewsOrEndsAt: subscription.cancel_at || subscription.current_period_end, canceling: Boolean(subscription.cancel_at_period_end || subscription.cancel_at), source: firstSourceForSession(analyticsSession), firstSource: firstSourceForSession(analyticsSession), firstMedium: firstTouch.first_medium || firstTouch.utm_medium || '', firstCampaign: firstTouch.first_campaign || firstTouch.utm_campaign || '', lastSource: normalizedSource(lastTouch.last_source || lastTouch.utm_source || firstTouch.first_source || 'direct'), lastMedium: lastTouch.last_medium || lastTouch.utm_medium || '', lastCampaign: lastTouch.last_campaign || lastTouch.utm_campaign || '', landingPage: analyticsSession?.first_path || firstTouch.landing_path || '', referralSource: association?.referral_code || firstTouch.referral_identifier || '', referralCreditsCents: memberRewards.filter(item => item.status === 'PAYOUT_SENT').reduce((sum,item)=>sum+Number(item.reward_amount_cents||0),0), pendingReferralCreditsCents: memberRewards.filter(item => !['PAYOUT_SENT','VOID'].includes(item.status)).reduce((sum,item)=>sum+Number(item.reward_amount_cents||0),0), failureReason: association?.last_error_code || '' };
  });
  const normalizedEmail = value => String(value || '').trim().toLowerCase();
  const distinct = values => [...new Set(values.filter(Boolean))];
  const duplicateGroups = [];
  const emailGroups = new Map(); const discordGroups = new Map(); const customerGroups = new Map();
  for (const member of baseMembers) {
    const email = normalizedEmail(member.email);
    if (email) emailGroups.set(email, [...(emailGroups.get(email) || []), member]);
    if (member.discordUserId) discordGroups.set(member.discordUserId, [...(discordGroups.get(member.discordUserId) || []), member]);
    if (member.stripeCustomerId) customerGroups.set(member.stripeCustomerId, [...(customerGroups.get(member.stripeCustomerId) || []), member]);
  }
  const addDuplicateGroup = (type, value, groupMembers, reason) => {
    const activeMembers = groupMembers.filter(item => ACTIVE_SUBSCRIPTION_STATUSES.has(item.status));
    duplicateGroups.push({ type, value, reason, risk: activeMembers.length > 1 ? 'high' : 'review', activeSubscriptions: activeMembers.length,
      customerIds: distinct(groupMembers.map(item => item.stripeCustomerId)), subscriptionIds: distinct(groupMembers.map(item => item.subscriptionId)),
      discordIds: distinct(groupMembers.map(item => item.discordUserId)), emails: distinct(groupMembers.map(item => normalizedEmail(item.email))), names: distinct(groupMembers.map(item => item.name)) });
  };
  for (const [email, groupMembers] of emailGroups) if (distinct(groupMembers.map(item => item.stripeCustomerId)).length > 1) addDuplicateGroup('email', email, groupMembers, 'Same email appears on separate Stripe customers');
  for (const [discordId, groupMembers] of discordGroups) if (distinct(groupMembers.map(item => item.stripeCustomerId)).length > 1) addDuplicateGroup('discord', discordId, groupMembers, 'Same Discord account appears on separate Stripe customers');
  for (const [customerId, groupMembers] of customerGroups) if (groupMembers.filter(item => ACTIVE_SUBSCRIPTION_STATUSES.has(item.status)).length > 1) addDuplicateGroup('subscription', customerId, groupMembers, 'Stripe customer has multiple active subscriptions');
  duplicateGroups.sort((a, b) => (a.risk === b.risk ? b.activeSubscriptions - a.activeSubscriptions : a.risk === 'high' ? -1 : 1));
  const duplicateSubscriptionIds = new Set(duplicateGroups.flatMap(group => group.subscriptionIds));
  const members = baseMembers.map(member => ({ ...member, duplicate: duplicateSubscriptionIds.has(member.subscriptionId), duplicateReasons: duplicateGroups.filter(group => group.subscriptionIds.includes(member.subscriptionId)).map(group => group.reason) }));
  const webhookFailures = (webhooks || []).filter(item => range.includes(item.received_at));
  const awaitingDiscord = (associations || []).filter(item => ['PAYMENT_CONFIRMED','VIP_PENDING','VIP_FAILED'].includes(item.status) && !item.discord_user_id);
  const failedPayments = rangedBilling.filter(item => item.event_type === 'invoice_failed');
  const failedPaymentDetails = failedPayments.map(item => {
    const member = members.find(member => member.subscriptionId === item.stripe_subscription_id || member.stripeCustomerId === item.stripe_customer_id);
    return { invoiceId: item.stripe_invoice_id || item.invoice_id || '', customerId: item.stripe_customer_id || '', subscriptionId: item.stripe_subscription_id || '', name: member?.name || '', email: member?.email || '', membershipStatus: member?.status || 'unknown', amountCents: Number(item.amount_cents || 0), occurredAt: item.occurred_at, eventId: item.stripe_event_id || item.id || '' };
  });
  const referralLinks = [
    ...(profiles || []).map(profile => ({ type: 'member', name: members.find(member => member.discordUserId === profile.discord_user_id)?.name || profile.discord_user_id, code: profile.referral_code, status: profile.payout_status || 'NOT_CONNECTED', discordUserId: profile.discord_user_id })),
    ...(creators || []).map(profile => ({ type: 'creator', name: profile.display_name, code: profile.referral_code, status: profile.status, discordUserId: profile.discord_user_id || '' })),
  ].filter(item => item.code).map(item => {
    const creatorId = item.type === 'creator' ? (creators || []).find(profile => profile.referral_code === item.code)?.id : null;
    const rewards = rangedReferrals.filter(reward => creatorId ? reward.creator_profile_id === creatorId : !reward.creator_profile_id && reward.referrer_discord_user_id === item.discordUserId);
    const visits = rangedSessions.filter(session => String(session.first_touch?.referral_identifier || session.first_touch?.referral_code || '').toUpperCase() === item.code.toUpperCase()).length;
    return { ...item, url: `${siteOrigin(env)}${SITE_PATH}/join?ref=${encodeURIComponent(item.code)}`, visits, successful: rewards.filter(reward => ['READY','PAYOUT_SENT'].includes(reward.status)).length, pending: rewards.filter(reward => !['READY','PAYOUT_SENT','VOID'].includes(reward.status)).length, paidCents: rewards.filter(reward => reward.status === 'PAYOUT_SENT').reduce((sum,reward) => sum + Number(reward.reward_amount_cents || 0),0) };
  });
  const referralReview = (referrals || []).filter(item => ['REVIEW_REQUIRED','PAYOUT_UNCERTAIN'].includes(item.status));
  return json({
    generatedAt: new Date().toISOString(), range: { preset: range.preset, start: range.start?.toISOString() || null, end: range.end.toISOString() },
    dataCompletenessWarnings,
    scoreboard: { todayPhoenix, activePaid: eligible.length, mrrCents: Math.round(mrr), newPaidToday, cancelledToday: cancellationTodayComplete ? cancelledToday : null, netAddsToday: cancellationTodayComplete ? newPaidToday - cancelledToday : null, newPaidLast7, netAddsLast7: cancellationLast7Complete ? newPaidLast7 - cancelledLast7 : null },
    traffic: { uniqueVisitors: rangedSessions.length, sessions: rangedSessions.length, joinVisitors: new Set(rangedEvents.filter(item => item.event_name === 'join_page_view').map(item => item.session_id)).size, sources, campaigns, countries: groupCount(rangedSessions, item => item.first_touch?.country), devices: groupCount(rangedSessions, item => item.first_touch?.device), browsers: groupCount(rangedSessions, item => item.first_touch?.browser), campaignCounts: groupCount(rangedSessions.filter(item => item.first_touch?.first_campaign || item.first_touch?.utm_campaign), item => item.first_touch?.first_campaign || item.first_touch?.utm_campaign), landingPages: groupCount(rangedSessions, item => item.first_path) },
    conversion: { funnel, offerSelections: countEvents('offer_selected'), discordConnections: countEvents('discord_verified'), checkoutStarts: countEvents('checkout_started'), successfulPayments: countEvents('payment_completed'), purchaseConversionRate: rangedSessions.length ? countEvents('payment_completed') / rangedSessions.length : 0, checkoutPurchaseConversionRate: countEvents('checkout_started') ? countEvents('payment_completed') / countEvents('checkout_started') : 0, vipActivationRate: countEvents('payment_completed') ? countEvents('vip_activated') / countEvents('payment_completed') : 0 },
    revenue: { collectedCents: collected, todayCents: paidSince(startOfDay), weekCents: paidSince(startOfWeek), monthCents: paidSince(startOfMonth), allTimeCents: allTimeRevenue, estimatedMrrCents: Math.round(mrr), newMrrCents: rangedBilling.filter(item => item.event_type === 'invoice_paid' && item.billing_reason !== 'subscription_cycle').reduce((sum,item)=>sum+Number(item.amount_cents||0),0), lostMrrCents: canceled.filter(item => range.includes(item.updated_at)).reduce((sum,item)=>sum+(item.offer === 'annual' ? Math.round(19499/12) : item.offer === 'six_month' ? Math.round(13499/6) : 3299),0), refundsCents: refunds, disputes: rangedBilling.filter(item => item.event_type === 'dispute').length, failedPayments: failedPayments.length, introRevenueCents: invoiceWithinRange.filter(item => item.amountPaid === 1000).reduce((sum,item)=>sum+item.amountPaid,0), subscriptionRevenueCents: collected },
    membership: { active: eligible.length, intro: eligible.filter(item => item.offer === 'starter').length, monthly: eligible.filter(item => ['trial_2_day','referral_trial'].includes(item.offer)).length, sixMonth: eligible.filter(item => item.offer === 'six_month').length, annual: eligible.filter(item => item.offer === 'annual').length, newMembers: countEvents('payment_completed'), renewals: rangedBilling.filter(item => item.event_type === 'invoice_paid' && item.billing_reason === 'subscription_cycle').length, scheduledCancellations: eligible.filter(item => item.cancel_at_period_end || item.cancel_at).length, actualCancellations: canceled.filter(item => range.includes(item.updated_at)).length, duplicateGroups, duplicateCount: duplicateGroups.length, highRiskDuplicateCount: duplicateGroups.filter(item => item.risk === 'high').length, members },
    discord: { paidWithoutVip: paidWithoutVip.length, vipActive: activeIds.size, pending: (associations || []).filter(item => item.status === 'VIP_PENDING').length, failed: (associations || []).filter(item => item.status === 'VIP_FAILED').length, recovered: (associations || []).filter(item => item.status === 'VIP_ACTIVE' && Number(item.activation_attempts || 0) > 1).length, paidDiscordMissing: paidWithoutVipDetails.filter(item => !item.discordConnected).length, vipWithoutEntitlement, details: paidWithoutVipDetails },
    referrals: { visits: countEvents('referral_visit') + rangedSessions.filter(item => item.first_touch?.first_source === 'referral' || item.first_touch?.referral_identifier).length, referredPurchases: rangedReferrals.length, pending: referralStatus('PENDING_PAYMENT') + referralStatus('HOLDING'), qualified: rangedReferrals.filter(item => ['READY','PAYOUT_SENT'].includes(item.status)).length, paidCashCents: rangedReferrals.filter(item => item.status === 'PAYOUT_SENT').reduce((sum, item) => sum + Number(item.reward_amount_cents || 0), 0), links: referralLinks, leaderboard: [...leaderboardMap.values()].map(item => ({ ...item, conversionRate: item.successfulReferrals + item.pendingReferrals ? item.successfulReferrals / (item.successfulReferrals + item.pendingReferrals) : 0 })).sort((a,b)=>b.successfulReferrals-a.successfulReferrals) },
    retention: {
      churnRate: (eligible.length + canceled.length) ? canceled.length / (eligible.length + canceled.length) : 0,
      renewalRate: rangedBilling.filter(item => item.billing_reason === 'subscription_cycle').length
        ? rangedBilling.filter(item => item.billing_reason === 'subscription_cycle' && item.event_type === 'invoice_paid').length / rangedBilling.filter(item => item.billing_reason === 'subscription_cycle').length : 0,
      averageDurationDays: durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : 0,
      starterToMonthlyRate: countEvents('starter_started') ? countEvents('starter_upgraded') / countEvents('starter_started') : 0,
      active30Days: activeAges.filter(days => days >= 30).length, active60Days: activeAges.filter(days => days >= 60).length, active90Days: activeAges.filter(days => days >= 90).length,
      firstWeekCancellations: canceled.filter(item => ageAtEndDays(item) <= 7).length,
      firstMonthCancellations: canceled.filter(item => ageAtEndDays(item) <= 31).length,
      cancellationReasons: rangedFeedback.reduce((result, item) => ({ ...result, [item.reason_code]: (result[item.reason_code] || 0) + 1 }), {}),
      offersShown: countEvents('retention_offer_shown'), offersAccepted: countEvents('retention_offer_accepted'),
    },
    history: [...historyMap.values()],
    operations: { freePick },
    alerts: { total: awaitingDiscord.length + paidWithoutVipDetails.length + webhookFailures.length + failedPayments.length + referralReview.length + duplicateGroups.length, awaitingDiscord, paidWithoutVip: paidWithoutVipDetails, webhookFailures, failedPayments: failedPaymentDetails, referralReview, duplicates: duplicateGroups },
  }, 200, origin);
}

async function adminRetryVip(request, env, origin) {
  if (!await readAdminSession(request, env)) return json({ error: 'Admin sign-in required.' }, 401, origin);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  if (data.associationId && /^[0-9a-f-]{36}$/i.test(data.associationId)) {
    const rows = await supabase(env, `membership_checkout_associations?id=eq.${encodeURIComponent(data.associationId)}&select=*&limit=1`);
    const association = rows?.[0];
    if (!association?.stripe_subscription_id || !association.discord_user_id) return json({ error: 'A verified paid association is required.' }, 403, origin);
    try { await activateCheckoutAssociation(env, association); return json({ ok: true }, 200, origin); }
    catch { return json({ error: 'Stripe entitlement was not eligible or Discord sync failed safely.' }, 409, origin); }
  }
  if (!/^sub_[A-Za-z0-9_]+$/.test(data.subscriptionId || '')) return json({ error: 'Invalid activation.' }, 400, origin);
  try {
    const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(data.subscriptionId)}`);
    const discordUserId = await discordUserForSubscription(env, subscription);
    if (!discordUserId || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) || await membershipEntitlementBlock(env, subscription.id)) throw new Error('Not entitled');
    await grantMemberRole(discordUserId, env);
    await recordMembershipEvent(env, { eventType: 'ADMIN_VIP_SYNC', actorType: 'discord_admin', customerId: stripeId(subscription.customer), subscriptionId: subscription.id, discordUserId });
    return json({ ok: true }, 200, origin);
  }
  catch { return json({ error: 'Stripe entitlement was not eligible or Discord sync failed safely.' }, 409, origin); }
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
      const associationId = String(session?.metadata?.checkout_association_id || '');
      if (!associationId || (session.payment_status === 'paid' && Number(session.amount_total || 0) > 0)) await queueMemberWelcome(env, event);
      if (/^[0-9a-f-]{36}$/i.test(associationId)) {
        const rows = await supabase(env, `membership_checkout_associations?id=eq.${encodeURIComponent(associationId)}&select=*&limit=1`);
        const association = rows?.[0];
        if (!association || association.stripe_checkout_session_id !== session.id) throw new Error('Stripe checkout association did not match the verified pending identity.');
        if (association.status === 'VIP_ACTIVE') outcome = 'PAYMENT_CONFIRMED_VIP_ALREADY_ACTIVE';
        else if (session.payment_status !== 'paid' || Number(session.amount_total || 0) <= 0) {
          await updateCheckoutAssociation(env, association.id, {
            status: 'CHECKOUT_STARTED', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId,
          }, ['CHECKOUT_STARTED']);
          outcome = 'DISCORD_VERIFIED_AWAITING_FIRST_PAYMENT';
        }
        else {
          await updateCheckoutAssociation(env, association.id, {
            status: 'PAYMENT_CONFIRMED', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId,
          }, ['CHECKOUT_STARTED','PAYMENT_CONFIRMED','VIP_PENDING','VIP_FAILED']);
          const refreshed = { ...association, status: 'PAYMENT_CONFIRMED', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId };
          await activateCheckoutAssociation(env, refreshed, event.id);
          outcome = 'PAYMENT_CONFIRMED_VIP_ACTIVATED';
        }
      }
      if (session?.metadata?.offer === 'referral_trial') {
        await createReferralAttribution(env, {
          referralCode: session.metadata.referral_code,
          referrerDiscordUserId: session.metadata.referrer_discord_user_id,
          creatorProfileId: session.metadata.creator_profile_id,
          customerId,
          subscriptionId,
        });
        outcome = 'REFERRAL_CHECKOUT_RECORDED';
      } else if (!associationId) outcome = 'CHECKOUT_RECORDED';
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      const subscription = event.data?.object;
      await persistSubscription(env, subscription, event.id);
      await recordSubscriptionCancellation(env, subscription);
      if (event.type === 'customer.subscription.updated') await recordRetentionRedemption(env, subscription, event.id);
      outcome = await syncMemberRole(subscription, env);
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data?.object;
      await recordBillingEvent(env, event, { eventType: 'invoice_paid', invoiceId: invoice?.id, customerId: stripeId(invoice?.customer), subscriptionId: invoiceSubscriptionId(invoice), amountCents: Number(invoice?.amount_paid), currency: invoice?.currency, billingReason: invoice?.billing_reason });
      const paidSubscriptionId = invoiceSubscriptionId(invoice);
      if (paidSubscriptionId && Number(invoice?.amount_paid || 0) > 0) {
        const rows = await supabase(env, `membership_checkout_associations?stripe_subscription_id=eq.${encodeURIComponent(paidSubscriptionId)}&status=neq.VIP_ACTIVE&select=*&limit=1`);
        if (rows?.[0]) {
          await activateCheckoutAssociation(env, rows[0], event.id);
          await queuePaidAssociationWelcome(env, rows[0], event, invoice);
        }
      }
      outcome = await processReferralInvoicePaid(env, invoice, event.id);
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data?.object;
      await recordBillingEvent(env, event, { eventType: 'invoice_failed', invoiceId: invoice?.id, customerId: stripeId(invoice?.customer), subscriptionId: invoiceSubscriptionId(invoice), amountCents: Number(invoice?.amount_due), currency: invoice?.currency });
      outcome = await processInvoicePaymentFailed(env, event.data?.object, event.id);
    } else if (event.type === 'charge.refunded') {
      const chargeObject = event.data?.object;
      const invoiceId = stripeId(chargeObject?.invoice);
      await recordBillingEvent(env, event, { eventType: 'refund', invoiceId, chargeId: chargeObject?.id, customerId: stripeId(chargeObject?.customer), amountCents: Number(chargeObject?.amount_refunded), currency: chargeObject?.currency });
      const entitlementOutcome = await blockEntitlementForInvoice(env, invoiceId, event.id, 'CHARGE_REFUNDED');
      const referralOutcome = await voidReferralForInvoice(env, invoiceId, 'QUALIFYING_CHARGE_REFUNDED');
      outcome = `${entitlementOutcome};${referralOutcome}`;
    } else if (event.type === 'charge.dispute.created') {
      const chargeId = stripeId(event.data?.object?.charge);
      if (!chargeId) outcome = 'DISPUTE_WITHOUT_CHARGE';
      else {
        const charge = await stripeGet(env, `/charges/${encodeURIComponent(chargeId)}`);
        const invoiceId = stripeId(charge?.invoice);
        await recordBillingEvent(env, event, { eventType: 'dispute', invoiceId, chargeId, customerId: stripeId(charge?.customer), amountCents: Number(event.data?.object?.amount), currency: event.data?.object?.currency });
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
    if (url.pathname.startsWith('/ops/member-welcomes')) {
      return handleMemberWelcomeQueue(request, env);
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
    if (request.method === 'POST' && url.pathname === '/ops/creators') return createCreatorInvitation(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/ops/creators/activate') return activateCreator(request, env, origin);
    if (request.method === 'GET' && url.pathname === '/cancel/offer') return json({ error: 'Use Discord login and Stripe Customer Portal.' }, 410, origin);
    if (request.method === 'GET' && url.pathname === '/admin/login') {
      if (!discordReady(env) || !env.ADMIN_DISCORD_USER_IDS) return new Response('Admin access is not configured.', { status: 503 });
      const state = await createDiscordState({ intent: 'admin' }, env);
      return redirect(discordAuthorizationUrl(state, env, 'admin'));
    }
    if (request.method === 'GET' && url.pathname === '/member/login') {
      if (!discordReady(env)) return discordNotReadyResponse(env);
      const state = await createDiscordState({ intent: 'member' }, env);
      return redirect(discordAuthorizationUrl(state, env, 'member'));
    }
    if (request.method === 'GET' && url.pathname === '/member/dashboard') return memberDashboard(request, env, origin);
    if (request.method === 'GET' && url.pathname === '/cancel/feedback-login') {
      if (!discordReady(env)) return discordNotReadyResponse(env);
      const state = await createDiscordState({ intent: 'feedback' }, env);
      return redirect(discordAuthorizationUrl(state, env, 'feedback'));
    }
    if (request.method === 'POST' && url.pathname === '/cancel/feedback') return saveCancellationFeedback(request, env, origin);
    if (request.method === 'GET' && url.pathname === '/admin/analytics') return adminAnalytics(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/admin/retry-vip') return adminRetryVip(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/analytics/event') return collectAnalytics(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/checkout/prepare') {
      const limited = await checkoutRateLimitResponse(request, env, origin);
      return limited || prepareCheckout(request, env, origin);
    }
    if (request.method === 'GET' && url.pathname === '/onboarding/status') return onboardingStatus(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/onboarding/retry') return retryOnboarding(request, env, origin);
    if (request.method === 'GET' && url.pathname === '/discord/connect') return startDiscordConnection(request, env);
    if (request.method === 'GET' && url.pathname === '/discord/login') return startPortalLogin(request, env);
    if (request.method === 'GET' && url.pathname === '/referrals/login') return startReferralLogin(request, env);
    if (request.method === 'GET' && url.pathname === '/creators/login') return startCreatorLogin(request, env);
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
    const frequent = Promise.all([retryPendingActivations(env), expireCreatorTrials(env), activateReadyCreators(env)]);
    const daily = controller.cron === '15 16 * * *'
      ? Promise.all([reconcileMemberships(env), processReferralPayouts(env), queueLifecycleReminders(env)]) : Promise.resolve();
    ctx.waitUntil(Promise.all([frequent, daily]));
  },
};

export const __test = {
  recordSubscriptionCancellation,
  cleanAttribution,
  supabasePages,
  memberWelcomeMessage,
  queueMemberWelcome,
  REFERRAL_REWARD_CENTS,
  authorizedOperationsRequest,
  claimDiscordLink,
  checkoutRateLimitResponse,
  createDiscordState,
  createReferralAttribution,
  checkCreatorIdentity,
  expireCreatorTrials,
  discordAuthorizationUrl,
  discordRoleReadiness,
  ensurePerMemberRetentionCoupon,
  acceptLastChanceRetention,
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
