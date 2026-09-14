import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { operationCheckConfig } from './check-membership-operations.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

export function pickOperationCheckConfig(env = process.env) {
  const { databaseUrl } = operationCheckConfig(env);
  const lookbackHours = Math.min(Math.max(Number(env.PICK_ALERT_LOOKBACK_HOURS || 26), 1), 168);
  const stuckMinutes = Math.min(Math.max(Number(env.PICK_ALERT_STUCK_MINUTES || 5), 2), 60);
  if (!Number.isFinite(lookbackHours) || !Number.isFinite(stuckMinutes)) {
    throw new Error('Pick-operation alert windows must be numeric.');
  }
  return { databaseUrl, lookbackHours, stuckMinutes };
}

export function evaluatePickOperationMetrics(row) {
  const metrics = {
    pendingApprovalCards: Number(row.pending_approval_cards || 0),
    stuckApprovedCards: Number(row.stuck_approved_cards || 0),
    stuckPublications: Number(row.stuck_publications || 0),
    unresolvedPublicationFailures: Number(row.unresolved_publication_failures || 0),
    failedRecaps: Number(row.failed_recaps || 0),
    networkErrors: Number(row.network_errors || 0),
    publishedPicks: Number(row.published_picks || 0),
    openAIRequests: Number(row.openai_requests || 0),
    openAIEstimatedCostUsd: Number(row.openai_estimated_cost_usd || 0),
    lastPublicationAt: row.last_publication_at || null,
    lastApiCallAt: row.last_api_call_at || null,
  };
  const alerts = [];
  if (metrics.stuckApprovedCards) alerts.push(`${metrics.stuckApprovedCards} approved card(s) are stuck before publication`);
  if (metrics.stuckPublications) alerts.push(`${metrics.stuckPublications} publication(s) remain stuck in PUBLISHING`);
  if (metrics.unresolvedPublicationFailures) alerts.push(`${metrics.unresolvedPublicationFailures} publication failure(s) remain unresolved`);
  if (metrics.failedRecaps) alerts.push(`${metrics.failedRecaps} recap delivery failure(s) occurred in the lookback window`);
  return { ok: alerts.length === 0, alerts, metrics };
}

export async function checkPickOperations(client, { lookbackHours, stuckMinutes }) {
  await client.query('BEGIN READ ONLY');
  try {
    const { rows } = await client.query(`
      WITH current_metrics AS (
        SELECT
          (SELECT COUNT(*)::int FROM approval_cards WHERE status = 'PENDING') AS pending_approval_cards,
          (SELECT COUNT(*)::int
             FROM approval_cards
            WHERE status = 'APPROVED_PENDING_PUBLICATION'
              AND action_at < NOW() - make_interval(mins => $2::int)) AS stuck_approved_cards,
          (SELECT COUNT(*)::int
             FROM published_picks
            WHERE status = 'PUBLISHING'
              AND updated_at < NOW() - make_interval(mins => $2::int)) AS stuck_publications,
          (SELECT COUNT(*)::int
             FROM published_picks failed
            WHERE failed.status IN ('POST_FAILED', 'FAILED')
              AND failed.updated_at >= NOW() - make_interval(hours => $1::int)
              AND NOT EXISTS (
                SELECT 1 FROM published_picks recovered
                 WHERE recovered.pick_id = failed.pick_id
                   AND recovered.status IN ('PUBLISHED', 'GRADED')
                   AND recovered.updated_at > failed.updated_at
              )) AS unresolved_publication_failures,
          (SELECT COUNT(*)::int
             FROM recap_runs failed
            WHERE failed.status IN ('FAILED', 'EMAIL_FAILED')
              AND failed.created_at >= NOW() - make_interval(hours => $1::int)
              AND NOT EXISTS (
                SELECT 1 FROM recap_runs recovered
                 WHERE recovered.operating_date = failed.operating_date
                   AND recovered.status NOT IN ('FAILED', 'EMAIL_FAILED', 'EMAIL_SEND_STARTED')
                   AND recovered.created_at > failed.created_at
              )) AS failed_recaps,
          (SELECT COUNT(*)::int
             FROM api_call_events
            WHERE outcome = 'NETWORK_ERROR'
              AND occurred_at >= NOW() - make_interval(hours => $1::int)) AS network_errors,
          (SELECT COUNT(*)::int
             FROM published_picks
            WHERE status IN ('PUBLISHED', 'GRADED')
              AND published_at >= NOW() - make_interval(hours => $1::int)) AS published_picks,
          (SELECT COUNT(*)::int
             FROM api_call_events
            WHERE service = 'openai'
              AND occurred_at >= NOW() - make_interval(hours => $1::int)) AS openai_requests,
          (SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric
             FROM extraction_runs
            WHERE started_at >= NOW() - make_interval(hours => $1::int)) AS openai_estimated_cost_usd,
          (SELECT MAX(published_at) FROM published_picks WHERE status IN ('PUBLISHED', 'GRADED')) AS last_publication_at,
          (SELECT MAX(occurred_at) FROM api_call_events) AS last_api_call_at
      )
      SELECT * FROM current_metrics
    `, [lookbackHours, stuckMinutes]);
    await client.query('COMMIT');
    return evaluatePickOperationMetrics(rows[0] || {});
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const config = pickOperationCheckConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 9_000,
  });
  try {
    const report = await checkPickOperations(pool, config);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Pick operations check failed safely. Review the private Actions run.');
    process.exitCode = 1;
  });
}
