import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const worker = await readFile(new URL('cloudflare/kobes-checkout-worker.js', root), 'utf8');
const migration = await readFile(new URL('pipeline/migrations/012_secure_onboarding_analytics.sql', root), 'utf8');
const membership = await readFile(new URL('membership.js', root), 'utf8');
const welcome = await readFile(new URL('welcome.js', root), 'utf8');
const admin = await readFile(new URL('admin-analytics.js', root), 'utf8');

test('pre-checkout Discord verification records identity but never grants VIP', () => {
  const start = worker.indexOf("state.intent === 'precheckout'");
  const end = worker.indexOf("state.intent === 'referral'", start);
  const block = worker.slice(start, end);
  assert.match(block, /precheckout_identity_verification/);
  assert.doesNotMatch(block, /grantMemberRole/);
  assert.doesNotMatch(block, new RegExp(`roles/\\$\\{env\\.DISCORD_MEMBER_ROLE_ID`));
});

test('new purchase path preserves offer, referral and acquisition attribution', () => {
  assert.match(membership, /checkout\/prepare/);
  assert.match(membership, /analytics_session_id/);
  assert.match(membership, /attribution/);
  assert.match(migration, /referral_code text/);
  assert.match(migration, /attribution jsonb/);
});

test('abandoned or failed checkout has no activation path', () => {
  assert.match(worker, /session\.status !== 'complete'/);
  assert.match(worker, /Stripe payment is not eligible/);
  assert.match(worker, /authoritative successful Stripe payment is required before VIP activation/);
});

test('browser-independent provisioning is driven by the signed Stripe webhook', () => {
  assert.match(worker, /event\.type === 'checkout\.session\.completed'/);
  assert.match(worker, /activateCheckoutAssociation\(env, refreshed, event\.id\)/);
  assert.doesNotMatch(welcome, /grantMemberRole|DISCORD_MEMBER_ROLE_ID/);
});

test('activation retry revalidates Stripe and remains idempotent', () => {
  assert.match(worker, /retryPendingActivations/);
  assert.match(worker, /stripeGet\(env, `\/checkout\/sessions/);
  assert.match(worker, /idempotencyKey: `link-\$\{association\.id\}`/);
  assert.match(worker, /dedupeKey: `vip_activated:/);
});

test('duplicate webhooks and existing links remain protected', () => {
  assert.match(worker, /ok: duplicate/);
  assert.match(worker, /association\.status === 'VIP_ACTIVE'/);
  assert.match(worker, /already connected to another Discord account/);
});

test('forged browser Discord and Stripe identifiers are not accepted by checkout preparation', () => {
  const start = worker.indexOf('async function prepareCheckout');
  const end = worker.indexOf('async function createAssociatedCheckout', start);
  const block = worker.slice(start, end);
  assert.doesNotMatch(block, /data\.discord/);
  assert.doesNotMatch(block, /data\.stripe/);
  assert.match(worker, /public_token_hash: await sha256Text\(token\)/);
});

test('refund, dispute and paid-through cancellation protections remain wired', () => {
  assert.match(worker, /charge\.refunded/);
  assert.match(worker, /charge\.dispute\.created/);
  assert.match(worker, /entitlement_blocked=is\.false/);
  assert.match(worker, /ACTIVE_SUBSCRIPTION_STATUSES\.has\(subscription\.status\)/);
});

test('welcome is status-only and admin retry calls a server-side entitlement action', () => {
  assert.match(welcome, /onboarding\/status/);
  assert.match(welcome, /onboarding\/retry/);
  assert.match(admin, /admin\/retry-vip/);
  assert.match(worker, /membershipEntitlementBlock/);
});

test('access health and funnel schemas contain the required durable states', () => {
  for (const value of ['PENDING_DISCORD','CHECKOUT_STARTED','PAYMENT_CONFIRMED','VIP_PENDING','VIP_ACTIVE','VIP_FAILED']) assert.match(migration, new RegExp(value));
  for (const value of ['offer_selected','discord_verified','checkout_started','payment_completed','vip_activated']) assert.match(migration, new RegExp(value));
});
