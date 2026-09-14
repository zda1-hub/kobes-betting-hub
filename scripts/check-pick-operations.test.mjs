import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPickOperations,
  evaluatePickOperationMetrics,
  pickOperationCheckConfig,
} from './check-pick-operations.mjs';

const productionUrl = () => 'postgresql://postgres.mpajyubbnnsdpgdizvht:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require';

test('pick operations config is locked to encrypted production Supabase', () => {
  const config = pickOperationCheckConfig({ DATABASE_URL: productionUrl() });
  assert.equal(config.lookbackHours, 26);
  assert.equal(config.stuckMinutes, 5);
  assert.throws(() => pickOperationCheckConfig({ DATABASE_URL: productionUrl().replace('mpajyubbnnsdpgdizvht', 'aaaaaaaaaaaaaaaaaaaa') }), /non-production/);
});

test('pick operations alerts cover stuck approvals, publication, recap, and network failures', () => {
  const report = evaluatePickOperationMetrics({
    pending_approval_cards: 4,
    stuck_approved_cards: 1,
    stuck_publications: 2,
    unresolved_publication_failures: 3,
    failed_recaps: 4,
    network_errors: 5,
    published_picks: 6,
    openai_requests: 7,
    openai_estimated_cost_usd: '0.1234',
  });
  assert.equal(report.ok, false);
  assert.equal(report.alerts.length, 4);
  assert.equal(report.metrics.pendingApprovalCards, 4);
  assert.equal(report.metrics.openAIEstimatedCostUsd, 0.1234);
});

test('pick operations check is read-only and never returns member or pick identifiers', async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (/WITH current_metrics/.test(sql)) return { rows: [{
        pending_approval_cards: 3,
        stuck_approved_cards: 0,
        stuck_publications: 0,
        unresolved_publication_failures: 0,
        failed_recaps: 0,
        network_errors: 0,
        published_picks: 1,
        openai_requests: 2,
        openai_estimated_cost_usd: '0.01',
        last_publication_at: '2026-09-13T18:00:00.000Z',
        last_api_call_at: '2026-09-13T18:01:00.000Z',
      }] };
      return { rows: [] };
    },
  };
  const report = await checkPickOperations(client, { lookbackHours: 26, stuckMinutes: 5 });
  assert.equal(report.ok, true);
  assert.deepEqual(calls.map(({ sql }) => sql.trim().split(/\s+/, 1)[0]), ['BEGIN', 'WITH', 'COMMIT']);
  assert.deepEqual(calls[1].parameters, [26, 5]);
  assert.doesNotMatch(JSON.stringify(report), /202609\d+-|(?:sub|cus)_[A-Za-z0-9_]+|\d{15,}/i);
});
