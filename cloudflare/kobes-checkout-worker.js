/**
 * Kobe's Betting Hub checkout service.
 *
 * Required Cloudflare Worker secrets:
 *   STRIPE_SECRET_KEY          Stripe restricted key (rk_live_...)
 *   STRIPE_WEBHOOK_SECRET      Stripe webhook signing secret (whsec_...)
 *   DISCORD_CLIENT_SECRET      Discord OAuth application client secret
 *   DISCORD_BOT_TOKEN          Discord bot token (Manage Roles permission required)
 *   DISCORD_OAUTH_STATE_SECRET Random secret used to secure OAuth state
 *
 * Required Worker variables:
 *   STRIPE_MONTHLY_PRICE_ID    $32.99/month recurring Stripe Price ID
 *   STRIPE_STARTER_PRICE_ID    $10/week recurring Stripe Price ID
 *   STRIPE_FIRST_MONTH_COUPON  40%-off-once Stripe Coupon ID
 *   DISCORD_CLIENT_ID          Discord OAuth application client ID
 *   DISCORD_GUILD_ID           Kobe's Discord server ID
 *   DISCORD_MEMBER_ROLE_ID     Paid-member role ID
 *   DISCORD_REDIRECT_URI       Worker callback URL registered in Discord
 */

const SITE_ORIGIN = 'https://zda1-hub.github.io';
const SITE_PATH = '/kobes-betting-hub';
const STRIPE_API = 'https://api.stripe.com/v1';

const headers = (origin) => ({
  'Access-Control-Allow-Origin': origin === SITE_ORIGIN ? origin : SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
  'Content-Type': 'application/json; charset=utf-8',
});

const json = (body, status = 200, origin) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
const form = (data) => new URLSearchParams(Object.entries(data).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]));

async function stripe(env, path, values) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: values ? form(values) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Stripe request failed.');
  return result;
}

async function stripeGet(env, path) {
  const response = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Stripe request failed.');
  return result;
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
  const parts = Object.fromEntries(signature.split(',').map((piece) => piece.split('=')));
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1 || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const digest = await crypto.subtle.sign('HMAC', await signingKey(secret), new TextEncoder().encode(`${timestamp}.${payload}`));
  return secureEqual(toHex(digest), parts.v1);
}

async function sign(value, secret) {
  const digest = await crypto.subtle.sign('HMAC', await signingKey(secret), encode.encode(value));
  return toHex(digest);
}

function discordReady(env) {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN && env.DISCORD_OAUTH_STATE_SECRET && env.DISCORD_GUILD_ID && env.DISCORD_MEMBER_ROLE_ID && env.DISCORD_REDIRECT_URI);
}

async function createDiscordState(sessionId, env) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const body = toBase64Url(encode.encode(JSON.stringify({ sessionId, expiresAt: Math.floor(Date.now() / 1000) + 600, nonce: toBase64Url(bytes) })));
  return `${body}.${await sign(body, env.DISCORD_OAUTH_STATE_SECRET)}`;
}

async function readDiscordState(state, env) {
  const [body, signature, ...extra] = state.split('.');
  if (!body || !signature || extra.length || !secureEqual(await sign(body, env.DISCORD_OAUTH_STATE_SECRET), signature)) throw new Error('Invalid Discord connection request.');
  const value = JSON.parse(decode.decode(fromBase64Url(body)));
  if (!value.sessionId || value.expiresAt < Math.floor(Date.now() / 1000)) throw new Error('That Discord connection link expired. Return to your checkout confirmation and try again.');
  return value;
}

async function activeSubscription(sessionId, env) {
  if (!/^cs_(live|test)_/.test(sessionId)) throw new Error('Invalid checkout session.');
  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session.status !== 'complete' || !session.subscription) throw new Error('Complete checkout before connecting Discord.');
  const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(session.subscription)}`);
  if (!['active', 'trialing'].includes(subscription.status)) throw new Error('Your membership is not active.');
  return subscription;
}

async function discordRequest(path, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, options);
  if (!response.ok) throw new Error('Discord could not complete the connection.');
  return response.status === 204 ? null : response.json();
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

async function startDiscordConnection(request, env) {
  if (!discordReady(env)) return new Response('Discord connection is being configured. Please check back shortly.', { status: 503 });
  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  try { await activeSubscription(sessionId, env); }
  catch (error) { return new Response(error.message, { status: 403 }); }

  const state = await createDiscordState(sessionId, env);
  const authorization = new URL('https://discord.com/oauth2/authorize');
  authorization.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.DISCORD_REDIRECT_URI,
    scope: 'identify guilds.join',
    state,
    prompt: 'consent',
  });
  return redirect(authorization.toString());
}

async function finishDiscordConnection(request, env) {
  if (!discordReady(env)) return new Response('Discord connection is being configured. Please check back shortly.', { status: 503 });
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || !returnedState) return new Response('Discord did not complete the connection.', { status: 400 });

  try {
    const { sessionId } = await readDiscordState(returnedState, env);
    const subscription = await activeSubscription(sessionId, env);
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: env.DISCORD_REDIRECT_URI }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error('Discord authorization failed.');
    const user = await discordRequest('/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const botHeaders = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' };
    await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, { method: 'PUT', headers: botHeaders, body: JSON.stringify({ access_token: token.access_token }) });
    await discordRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, { method: 'PUT', headers: botHeaders });
    await fetch('https://discord.com/api/oauth2/token/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, token: token.access_token, token_type_hint: 'access_token' }) });
    return redirect(`${SITE_ORIGIN}${SITE_PATH}/membership.html?checkout=connected&subscription=${encodeURIComponent(subscription.id)}`);
  } catch (error) {
    return new Response(error.message || 'Discord connection failed.', { status: 400 });
  }
}

async function createCheckout(request, env, origin) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }
  if (!['trial', 'starter'].includes(data.offer)) return json({ error: 'Choose a valid membership offer.' }, 400, origin);
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_MONTHLY_PRICE_ID || !env.STRIPE_STARTER_PRICE_ID || !env.STRIPE_FIRST_MONTH_COUPON) {
    return json({ error: 'Checkout is being finalized. Please try again shortly.' }, 503, origin);
  }

  const isTrial = data.offer === 'trial';
  const membershipPage = `${SITE_ORIGIN}${SITE_PATH}/membership.html`;
  const values = {
    mode: 'subscription',
    success_url: `${membershipPage}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${membershipPage}?checkout=cancel`,
    payment_method_collection: 'always',
    'payment_method_types[0]': 'card',
    billing_address_collection: 'auto',
    'line_items[0][price]': isTrial ? env.STRIPE_MONTHLY_PRICE_ID : env.STRIPE_STARTER_PRICE_ID,
    'line_items[0][quantity]': 1,
    'metadata[offer]': data.offer,
    'subscription_data[metadata][offer]': data.offer,
  };
  if (isTrial) {
    values['discounts[0][coupon]'] = env.STRIPE_FIRST_MONTH_COUPON;
    values['subscription_data[trial_period_days]'] = 2;
    values['subscription_data[trial_settings][end_behavior][missing_payment_method]'] = 'cancel';
  }
  try {
    const session = await stripe(env, '/checkout/sessions', values);
    return json({ url: session.url }, 200, origin);
  } catch (error) {
    return json({ error: error.message }, 502, origin);
  }
}

async function scheduleStarterSubscription(subscriptionId, env) {
  const schedule = await stripe(env, '/subscription_schedules', { from_subscription: subscriptionId });
  await stripe(env, `/subscription_schedules/${schedule.id}`, {
    end_behavior: 'release',
    'phases[0][items][0][price]': env.STRIPE_STARTER_PRICE_ID,
    'phases[0][items][0][quantity]': 1,
    'phases[0][iterations]': 1,
    'phases[1][items][0][price]': env.STRIPE_MONTHLY_PRICE_ID,
    'phases[1][items][0][quantity]': 1,
  });
}

async function handleWebhook(request, env) {
  const payload = await request.text();
  const valid = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid Stripe signature.', { status: 400 });
  const event = JSON.parse(payload);
  if (event.type === 'checkout.session.completed' && event.data?.object?.metadata?.offer === 'starter') {
    try { await scheduleStarterSubscription(event.data.object.subscription, env); }
    catch (error) { return new Response(`Starter schedule not created: ${error.message}`, { status: 500 }); }
  }
  return new Response('ok', { status: 200 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true }, 200, origin);
    if (request.method === 'GET' && url.pathname === '/discord/connect') return startDiscordConnection(request, env);
    if (request.method === 'GET' && url.pathname === '/discord/callback') return finishDiscordConnection(request, env);
    if (request.method === 'POST' && url.pathname === '/create-checkout') return createCheckout(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/stripe-webhook') return handleWebhook(request, env);
    return json({ error: 'Not found.' }, 404, origin);
  },
};
