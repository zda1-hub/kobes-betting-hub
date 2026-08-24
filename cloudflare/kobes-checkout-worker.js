/**
 * Kobe's Betting Hub checkout service.
 *
 * Required Cloudflare Worker secrets:
 *   STRIPE_SECRET_KEY          Stripe restricted key (rk_live_...)
 *   STRIPE_WEBHOOK_SECRET      Stripe webhook signing secret (whsec_...)
 *
 * Required Worker variables:
 *   STRIPE_MONTHLY_PRICE_ID    $32.99/month recurring Stripe Price ID
 *   STRIPE_STARTER_PRICE_ID    $10/week recurring Stripe Price ID
 *   STRIPE_FIRST_MONTH_COUPON  40%-off-once Stripe Coupon ID
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

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const toHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

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
    if (request.method === 'POST' && url.pathname === '/create-checkout') return createCheckout(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/stripe-webhook') return handleWebhook(request, env);
    return json({ error: 'Not found.' }, 404, origin);
  },
};
