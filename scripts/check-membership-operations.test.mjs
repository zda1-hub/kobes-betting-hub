import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMembershipOperations,
  evaluateMembershipMetrics,
  operationCheckConfig,
} from './check-membership-operations.mjs';

const productionUrl = () => 'postgresql://postgres.mpajyubbnnsdpgdizvht:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

test('membership operations config is locked to encrypted production Supabase', () => {
  const config = operationCheckConfig({ DATABASE_URL: productionUrl() });
  assert.equal(config.lookbackHours, 26);
  assert.equal(config.linkGraceMinutes, 30);
  assert.throws(() => operationCheckConfig({ DATABASE_URL: productionUrl().replace('mpajyubbnnsdpgdizvht', 'aaaaaaaaaaaaaaaaaaaa') }), /non-production/);
  assert.throws(() => operationCheckConfig({ DATABASE_URL: productionUrl().replace('?sslmode=require', '') }), /encrypted transport/);
});

test('membership metrics fail on every paid-without-access and processing exception class', () => {
  const report = evaluateMembershipMetrics({
    active_without_discord: 1,
    reconciliation_failures: 2,
    failed_webhooks: 3,
    stuck_webhooks: 4,
    active_subscriptions: 5,
    last_reconciled_at: null,
    reconciliation_stale: true,
  });
  assert.equal(report.ok, false);
  assert.equal(report.alerts.length, 5);
  assert.equal(report.metrics.activeWithoutDiscord, 1);
});

test('membership operations check is one read-only transaction with no identifiers in output', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (/WITH current_metrics/.test(sql)) return { rows: [{
        active_without_discord: 0,
        reconciliation_failures: 0,
        failed_webhooks: 0,
        stuck_webhooks: 0,
        active_subscriptions: 2,
        last_reconciled_at: '2026-09-13T16:15:00.000Z',
        reconciliation_stale: false,
      }] };
      return { rows: [] };
    },
  };
  const report = await checkMembershipOperations(client, { lookbackHours: 26, linkGraceMinutes: 30 });
  assert.equal(report.ok, true);
  assert.deepEqual(calls.map(({ sql }) => sql.trim().split(/\s+/, 1)[0]), ['BEGIN', 'WITH', 'COMMIT']);
  assert.deepEqual(calls[1].parameters, [26, 30]);
  assert.doesNotMatch(JSON.stringify(report), /(?:sub|cus)_[A-Za-z0-9_]+|\d{15,}/i);
  assert.match(calls[1].sql, /NOT EXISTS/);
  assert.match(calls[1].sql, /recovered\.occurred_at > failed\.occurred_at/);
});

test('private operations alarm surfaces held or uncertain referral payouts', () => {
  const report = evaluateMembershipMetrics({ referral_safety_holds: 2 });
  assert.equal(report.ok, false);
  assert.equal(report.metrics.referralSafetyHolds, 2);
  assert.match(report.alerts[0], /safety review or payout reconciliation/);
});
