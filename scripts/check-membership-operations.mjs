import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { EXPECTED_PRODUCTION_PROJECT_REF, projectRefFromDatabaseUrl } = require('../pipeline/migrate-production');

export function operationCheckConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const parsed = projectRefFromDatabaseUrl(databaseUrl);
  if (parsed.projectRef !== EXPECTED_PRODUCTION_PROJECT_REF) throw new Error('Refusing a non-production Supabase project.');
  if (!['require', 'verify-ca', 'verify-full'].includes(parsed.url.searchParams.get('sslmode'))) {
    throw new Error('DATABASE_URL must require encrypted transport.');
  }
  const lookbackHours = Math.min(Math.max(Number(env.MEMBERSHIP_ALERT_LOOKBACK_HOURS || 26), 1), 168);
  const linkGraceMinutes = Math.min(Math.max(Number(env.MEMBERSHIP_LINK_GRACE_MINUTES || 30), 5), 1440);
  if (!Number.isFinite(lookbackHours) || !Number.isFinite(linkGraceMinutes)) throw new Error('Membership alert windows must be numeric.');
  return { databaseUrl, lookbackHours, linkGraceMinutes };
}

export function evaluateMembershipMetrics(row) {
  const metrics = {
    activeWithoutDiscord: Number(row.active_without_discord || 0),
    reconciliationFailures: Number(row.reconciliation_failures || 0),
    failedWebhooks: Number(row.failed_webhooks || 0),
    stuckWebhooks: Number(row.stuck_webhooks || 0),
    activeSubscriptions: Number(row.active_subscriptions || 0),
    lastReconciledAt: row.last_reconciled_at || null,
    reconciliationStale: Boolean(row.reconciliation_stale),
  };
  const alerts = [];
  if (metrics.activeWithoutDiscord) alerts.push(`${metrics.activeWithoutDiscord} active membership(s) remain unlinked after the grace window`);
  if (metrics.reconciliationFailures) alerts.push(`${metrics.reconciliationFailures} reconciliation failure event(s) occurred in the lookback window`);
  if (metrics.failedWebhooks) alerts.push(`${metrics.failedWebhooks} Stripe webhook(s) failed processing in the lookback window`);
  if (metrics.stuckWebhooks) alerts.push(`${metrics.stuckWebhooks} Stripe webhook(s) remain RECEIVED beyond 15 minutes`);
  if (metrics.reconciliationStale) alerts.push('membership reconciliation is missing or older than the allowed window');
  return { ok: alerts.length === 0, alerts, metrics };
}

export async function checkMembershipOperations(client, { lookbackHours, linkGraceMinutes }) {
  await client.query('BEGIN READ ONLY');
  try {
    const { rows } = await client.query(`
      WITH current_metrics AS (
        SELECT
          (SELECT COUNT(*)::int
             FROM membership_subscriptions s
             LEFT JOIN membership_customers c ON c.stripe_customer_id = s.stripe_customer_id
            WHERE s.status IN ('active', 'trialing')
              AND NOT s.entitlement_blocked
              AND c.discord_user_id IS NULL
              AND s.created_at < NOW() - make_interval(mins => $2::int)) AS active_without_discord,
          (SELECT COUNT(*)::int
             FROM membership_events failed
            WHERE failed.event_type = 'MEMBERSHIP_RECONCILIATION_FAILED'
              AND failed.occurred_at >= NOW() - make_interval(hours => $1::int)
              AND NOT EXISTS (
                SELECT 1
                  FROM membership_events recovered
                 WHERE recovered.event_type = 'MEMBERSHIP_RECONCILED'
                   AND recovered.stripe_subscription_id = failed.stripe_subscription_id
                   AND recovered.occurred_at > failed.occurred_at
              )) AS reconciliation_failures,
          (SELECT COUNT(*)::int
             FROM stripe_webhook_events
            WHERE status = 'FAILED'
              AND received_at >= NOW() - make_interval(hours => $1::int)) AS failed_webhooks,
          (SELECT COUNT(*)::int
             FROM stripe_webhook_events
            WHERE status = 'RECEIVED'
              AND received_at < NOW() - INTERVAL '15 minutes') AS stuck_webhooks,
          (SELECT COUNT(*)::int
             FROM membership_subscriptions
            WHERE status IN ('active', 'trialing')) AS active_subscriptions,
          (SELECT MAX(occurred_at)
             FROM membership_events
            WHERE event_type = 'MEMBERSHIP_RECONCILED') AS last_reconciled_at
      )
      SELECT *,
        active_subscriptions > 0
        AND (last_reconciled_at IS NULL OR last_reconciled_at < NOW() - make_interval(hours => $1::int)) AS reconciliation_stale
      FROM current_metrics
    `, [lookbackHours, linkGraceMinutes]);
    await client.query('COMMIT');
    return evaluateMembershipMetrics(rows[0] || {});
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const config = operationCheckConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 9_000,
  });
  try {
    const report = await checkMembershipOperations(pool, config);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Membership operations check failed safely. Review the private Actions run.');
    process.exitCode = 1;
  });
}
