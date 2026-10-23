import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { __test: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const now = Date.parse('2026-10-11T23:00:00Z');
const range = api.analyticsRange(new URL('https://worker.test/admin/analytics?range=7d'), new Date(now));
const start = (id, at) => ({ event_name: 'trial_started', stripe_subscription_id: id, occurred_at: at,
  properties: { verified: true, trial_start: at, trial_end: new Date(Date.parse(at) + 172800000).toISOString() } });
const payment = (id, at) => ({ event_name: 'payment_completed', stripe_subscription_id: id, occurred_at: at });
test('subscriber reporting distinguishes an unavailable service from auth and endpoint failures without blocking metrics', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  assert.deepEqual(await api.loadEmailStats({}, range), { data: null, status: 'unconfigured' });
  assert.equal(stub.mock.callCount(), 0);
  const env = { DASHBOARD_STATS_SECRET: 'test-only' };
  assert.deepEqual(await api.loadEmailStats(env, range), { data: null, status: 'authentication_failed' });
  stub.mock.mockImplementation(async () => new Response('{}', { status: 404 }));
  assert.equal((await api.loadEmailStats(env, range)).status, 'endpoint_missing');
  stub.mock.mockImplementation(async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); });
  assert.equal((await api.loadEmailStats(env, range)).status, 'timeout');
  stub.mock.mockImplementation(async () => new Response('{"activeSubscribers":3}', { status: 200 }));
  assert.deepEqual(await api.loadEmailStats(env, range), { data: { activeSubscribers: 3 }, status: 'available' });
});
test('subscriber counts use the private publisher binding and preserve bearer authorization and range', async t => {
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network must not be used'); });
  let observed;
  const env = { DASHBOARD_STATS_SECRET: 'fixture-only', PUBLISHER_SERVICE: { async fetch(request) {
    observed = request;
    return new Response('{"activeSubscribers":7}', { status: 200 });
  } } };
  assert.deepEqual(await api.loadEmailStats(env, range), { data: { activeSubscribers: 7 }, status: 'available' });
  assert.equal(network.mock.callCount(), 0);
  assert.equal(observed.headers.get('Authorization'), 'Bearer fixture-only');
  const url = new URL(observed.url);
  assert.equal(url.pathname, '/api/admin/email-stats');
  assert.equal(url.searchParams.get('end'), range.end.toISOString());
});
test('only matured verified two-day trials enter the trial-to-first-paid denominator', () => {
  const events = [start('sub_paid', '2026-10-08T23:00:00Z'), start('sub_unpaid', '2026-10-08T23:00:00Z'),
    start('sub_today', '2026-10-11T22:00:00Z'), payment('sub_paid', '2026-10-10T23:00:00Z'),
    payment('sub_today', '2026-10-11T22:05:00Z'),
    { event_name: 'vip_activated', stripe_subscription_id: 'sub_today', occurred_at: '2026-10-11T22:00:01Z' }];
  const summary = api.trialConversionSummary(events, range, now);
  assert.equal(summary.started, 3);
  assert.equal(summary.pendingMaturation, 1);
  assert.equal(summary.matured, 2);
  assert.equal(summary.firstPaidAfterTrial, 1);
  assert.equal(summary.trialToPaidRate, .5);
  assert.equal(summary.paidBeforeTrialEnd, 1);
  assert.equal(summary.vipActivated, 1);
  assert.equal(summary.maturedWithoutFirstPayment, 1);
});
test('trial cohort deduplicates subscriptions, excludes unverifiable/history records and reads payment beyond selected range', () => {
  const cohortRange = api.analyticsRange(new URL('https://worker.test/admin/analytics?range=custom&start=2026-10-08T00:00:00Z&end=2026-10-09T00:00:00Z'), new Date(now));
  const valid = start('sub_paid', '2026-10-08T12:00:00Z');
  const unverified = start('sub_fake', '2026-10-08T12:00:00Z'); unverified.properties.verified = false;
  const wrongDuration = start('sub_wrong', '2026-10-08T12:00:00Z'); wrongDuration.properties.trial_end = '2026-10-09T12:00:00Z';
  const result = api.trialConversionSummary([valid, valid, unverified, wrongDuration,
    start('sub_old', '2026-09-01T12:00:00Z'), payment('sub_paid', '2026-10-10T12:00:00Z')], cohortRange, now);
  assert.equal(result.started, 1);
  assert.equal(result.firstPaidAfterTrial, 1);
  assert.equal(result.trialToPaidRate, 1);
  const pending = api.trialConversionSummary([start('sub_new', '2026-10-11T22:00:00Z')], range, now);
  assert.equal(pending.trialToPaidRate, null);
  assert.equal(api.trialConversionSummary([], range, now).trialToPaidRate, null);
});
test('trialing recurring value is potential only; paid starter access remains paid without inflating paid MRR', () => {
  const rows = [
    { stripe_subscription_id: 'sub_active', status: 'active', offer: 'monthly' },
    { stripe_subscription_id: 'sub_free', status: 'trialing', offer: 'monthly' },
    { stripe_subscription_id: 'sub_starter', status: 'trialing', offer: 'starter' },
    { stripe_subscription_id: 'sub_blocked', status: 'active', entitlement_blocked: true },
    { stripe_subscription_id: 'sub_cancelled', status: 'canceled' }];
  const summary = api.subscriptionRevenueSummary(rows, new Set(['sub_starter']));
  assert.equal(summary.entitled.length, 3);
  assert.equal(summary.paid.length, 2);
  assert.equal(summary.trialing.length, 1);
  assert.equal(summary.statusTrialing.length, 2);
  assert.equal(summary.paidMrrCents, 3299);
  assert.equal(summary.potentialTrialMrrCents, 6598);
  const missing = api.partitionMissingVipDetails(rows.slice(0, 3).map(r => ({ subscriptionId: r.stripe_subscription_id, entitlementStatus: r.status })), new Set(['sub_starter']));
  assert.deepEqual(missing.paid.map(r => r.subscriptionId), ['sub_active', 'sub_starter']);
  assert.deepEqual(missing.trial.map(r => r.subscriptionId), ['sub_free']);
});
test('canceling a duplicate free trial is neither paid churn nor lost paid membership', () => {
  const events = [
    { event_name: 'cancellation_completed', stripe_subscription_id: 'sub_duplicate_trial' },
    { event_name: 'cancellation_completed', stripe_subscription_id: 'sub_paid' },
  ];
  assert.deepEqual(api.paidCancellationEvents(events, new Set(['sub_paid'])), [events[1]]);
  const members = [
    { name: 'Max', email: 'max@example.com', status: 'trialing', subscriptionId: 'sub_original', stripeCustomerId: 'cus_1', discordUserId: 'discord_1' },
    { name: 'Max', email: 'max@example.com', status: 'canceled', subscriptionId: 'sub_duplicate_trial', stripeCustomerId: 'cus_2' },
  ];
  assert.deepEqual(api.activeDuplicateGroups(members), []);
  members[1].status = 'trialing';
  const overlapping = api.activeDuplicateGroups(members);
  assert.equal(overlapping.length, 1);
  assert.equal(overlapping[0].risk, 'high');
  assert.equal(overlapping[0].activeSubscriptions, 2);
});
test('trial event migration retains previously accepted analytics names', async () => {
  const previous = await readFile(new URL('../pipeline/migrations/016_discord_join_attribution.sql', import.meta.url), 'utf8');
  const next = await readFile(new URL('../pipeline/migrations/019_trial_conversion_reporting.sql', import.meta.url), 'utf8');
  const names = text => [...text.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).filter(s => !s.startsWith('016_') && !s.startsWith('019_'));
  for (const name of names(previous)) assert.ok(names(next).includes(name));
  assert.ok(names(next).includes('trial_started'));
});

test('live VIP role health overrides a stale stored label, while unavailable checks preserve uncertainty',()=>{
 assert.equal(api.reportedVipStatus('UNKNOWN','ACTIVE'),'VIP_ACTIVE');
 assert.equal(api.reportedVipStatus('VIP_ACTIVE','MISSING'),'VIP_ROLE_MISSING');
 assert.equal(api.reportedVipStatus('UNKNOWN','CHECK_FAILED'),'UNKNOWN');
 assert.equal(api.reportedVipStatus(null,'MISSING_DISCORD'),'MISSING_DISCORD');
});

test('entitled workflow counts exclude historical and already recovered association failures',()=>{
 const checks=[{subscription:{stripe_subscription_id:'sub_pending'},role:'MISSING'},
   {subscription:{stripe_subscription_id:'sub_failed'},role:'MISSING'},
   {subscription:{stripe_subscription_id:'sub_recovered'},role:'ACTIVE'}];
 const associations=[{stripe_subscription_id:'sub_pending',status:'VIP_PENDING'},
   {stripe_subscription_id:'sub_failed',status:'VIP_FAILED'},
   {stripe_subscription_id:'sub_recovered',status:'VIP_FAILED'},
   {stripe_subscription_id:'sub_cancelled',status:'VIP_PENDING'}];
 assert.deepEqual(api.entitledVipWorkflowSummary(checks,associations),{pending:1,failed:1});
});
