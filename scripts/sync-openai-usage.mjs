import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { closeAuditStore, recordProviderUsageSnapshot, sha256 } = require('../pipeline/audit-store');
const { auditedFetch } = require('../pipeline/api-client');

const adminKey = String(process.env.OPENAI_ADMIN_KEY || '').trim();
if (!adminKey) throw new Error('OPENAI_ADMIN_KEY is required. Use an organization Admin API key, not the model-request project key.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const hours = Math.min(Math.max(Number(process.env.OPENAI_USAGE_LOOKBACK_HOURS || 48), 1), 168);
const startTime = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000);
const headers = { Authorization: `Bearer ${adminKey}` };

async function pages(path, parameters) {
  const rows = [];
  let page;
  do {
    const query = new URLSearchParams(parameters);
    if (page) query.set('page', page);
    const response = await auditedFetch(`https://api.openai.com/v1${path}?${query}`, { headers }, {
      service: 'openai', endpointClass: path, callerComponent: 'scripts/sync-openai-usage',
      triggerType: 'usage_reconciliation', operationId: crypto.randomUUID(),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI usage request failed (${response.status}).`);
    rows.push(...(payload.data || []));
    page = payload.has_more ? payload.next_page : null;
  } while (page);
  return rows;
}

async function syncUsage() {
  const buckets = await pages('/organization/usage/completions', [
    ['start_time', String(startTime)], ['bucket_width', '1h'], ['limit', '168'],
    ['group_by[]', 'project_id'], ['group_by[]', 'api_key_id'], ['group_by[]', 'model'],
  ]);
  let imported = 0;
  for (const bucket of buckets) {
    for (const result of bucket.results || []) {
      await recordProviderUsageSnapshot({
        provider: 'openai', source: 'openai_usage_api', projectReference: result.project_id,
        apiKeyReference: result.api_key_id, model: result.model,
        windowStart: new Date(bucket.start_time * 1000).toISOString(),
        windowEnd: new Date(bucket.end_time * 1000).toISOString(),
        requestCount: result.num_model_requests, inputTokens: result.input_tokens,
        cachedInputTokens: result.input_cached_tokens, outputTokens: result.output_tokens,
        payloadSha256: sha256(result),
      });
      imported += 1;
    }
  }
  return imported;
}

async function syncCosts() {
  const buckets = await pages('/organization/costs', [
    ['start_time', String(startTime)], ['bucket_width', '1d'], ['limit', '7'], ['group_by[]', 'project_id'],
  ]);
  let imported = 0;
  for (const bucket of buckets) {
    for (const result of bucket.results || []) {
      await recordProviderUsageSnapshot({
        provider: 'openai', source: 'openai_costs_api', projectReference: result.project_id,
        windowStart: new Date(bucket.start_time * 1000).toISOString(),
        windowEnd: new Date(bucket.end_time * 1000).toISOString(),
        providerCostUsd: result.amount?.value, payloadSha256: sha256(result),
      });
      imported += 1;
    }
  }
  return imported;
}

try {
  const [usageRows, costRows] = await Promise.all([syncUsage(), syncCosts()]);
  console.log(JSON.stringify({ ok: true, usage_rows: usageRows, cost_rows: costRows, lookback_hours: hours }));
} finally {
  await closeAuditStore();
}
