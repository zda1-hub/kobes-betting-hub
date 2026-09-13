import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { closeAuditStore, recordProviderUsageSnapshot, sha256 } = require('../pipeline/audit-store');
const { auditedFetch } = require('../pipeline/api-client');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function parseLookbackHours(value) {
  const parsed = Number(value ?? 48);
  if (!Number.isFinite(parsed)) return 48;
  return Math.min(Math.max(parsed, 1), 168);
}

export function reconciliationConfig(env = process.env, nowMs = Date.now()) {
  const adminKey = String(env.OPENAI_ADMIN_KEY || '').trim();
  const expectedProjectId = String(env.OPENAI_EXPECTED_PROJECT_ID || '').trim();
  const expectedApiKeyId = String(env.OPENAI_EXPECTED_API_KEY_ID || '').trim();
  if (!adminKey) {
    throw new Error('OPENAI_ADMIN_KEY is required. Use an organization Admin API key, not the model-request project key.');
  }
  if (!String(env.DATABASE_URL || '').trim()) throw new Error('DATABASE_URL is required.');
  if (!expectedProjectId) throw new Error('OPENAI_EXPECTED_PROJECT_ID is required for the production-project guard.');
  if (!expectedApiKeyId) throw new Error('OPENAI_EXPECTED_API_KEY_ID is required for the production-key guard.');

  const hours = parseLookbackHours(env.OPENAI_USAGE_LOOKBACK_HOURS);
  return {
    adminKey,
    expectedProjectId,
    expectedApiKeyId,
    hours,
    startTime: Math.floor((nowMs - hours * 60 * 60 * 1000) / 1000),
  };
}

function scopeGuardError(source, expectedProjectId, expectedApiKeyId, count) {
  return new Error(
    `OpenAI reconciliation scope guard rejected ${source}: expected only project ${expectedProjectId} `
    + `and API key ${expectedApiKeyId}; received ${count} row(s) for a different or missing scope.`,
  );
}

export function assertExpectedScope(buckets, expectedProjectId, expectedApiKeyId, source) {
  let mismatches = 0;
  for (const bucket of buckets) {
    for (const result of bucket?.results || []) {
      if (
        String(result?.project_id || '') !== expectedProjectId
        || String(result?.api_key_id || '') !== expectedApiKeyId
      ) mismatches += 1;
    }
  }
  if (mismatches) throw scopeGuardError(source, expectedProjectId, expectedApiKeyId, mismatches);
}

export function prepareUsageSnapshots(buckets, expectedProjectId, expectedApiKeyId, hash = sha256) {
  assertExpectedScope(buckets, expectedProjectId, expectedApiKeyId, 'usage data');
  return buckets.flatMap((bucket) => (bucket.results || []).map((result) => ({
    provider: 'openai',
    source: 'openai_usage_api',
    projectReference: result.project_id,
    apiKeyReference: result.api_key_id,
    model: result.model,
    windowStart: new Date(bucket.start_time * 1000).toISOString(),
    windowEnd: new Date(bucket.end_time * 1000).toISOString(),
    requestCount: result.num_model_requests,
    inputTokens: result.input_tokens,
    cachedInputTokens: result.input_cached_tokens,
    outputTokens: result.output_tokens,
    payloadSha256: hash(result),
  })));
}

export function prepareCostSnapshots(buckets, expectedProjectId, expectedApiKeyId, hash = sha256) {
  assertExpectedScope(buckets, expectedProjectId, expectedApiKeyId, 'cost data');
  return buckets.flatMap((bucket) => (bucket.results || []).map((result) => ({
    provider: 'openai',
    source: 'openai_costs_api',
    projectReference: result.project_id,
    apiKeyReference: result.api_key_id,
    windowStart: new Date(bucket.start_time * 1000).toISOString(),
    windowEnd: new Date(bucket.end_time * 1000).toISOString(),
    providerCostUsd: result.amount?.value,
    payloadSha256: hash(result),
  })));
}

export async function fetchPages({ path, parameters, headers, operationId, fetchFn = auditedFetch }) {
  const rows = [];
  const seenPages = new Set();
  let page;
  do {
    const query = new URLSearchParams(parameters);
    if (page) query.set('page', page);
    const response = await fetchFn(`${OPENAI_BASE_URL}${path}?${query}`, { headers }, {
      service: 'openai',
      endpointClass: path,
      callerComponent: 'scripts/sync-openai-usage',
      triggerType: 'usage_reconciliation',
      operationId,
    });

    if (!response.ok) {
      // Do not surface a provider response body: it is untrusted and may echo credentials.
      throw new Error(`OpenAI reconciliation request failed (${response.status}) for ${path}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`OpenAI reconciliation returned invalid JSON for ${path}.`);
    }
    rows.push(...(Array.isArray(payload?.data) ? payload.data : []));

    if (payload?.has_more) {
      const nextPage = String(payload.next_page || '').trim();
      if (!nextPage || seenPages.has(nextPage)) {
        throw new Error(`OpenAI reconciliation returned an invalid pagination cursor for ${path}.`);
      }
      seenPages.add(nextPage);
      page = nextPage;
    } else {
      page = null;
    }
  } while (page);
  return rows;
}

export async function verifyExpectedApiKey({
  expectedProjectId,
  expectedApiKeyId,
  headers,
  operationId,
  fetchFn = auditedFetch,
}) {
  const path = `/organization/projects/${encodeURIComponent(expectedProjectId)}`
    + `/api_keys/${encodeURIComponent(expectedApiKeyId)}`;
  const response = await fetchFn(`${OPENAI_BASE_URL}${path}`, { headers }, {
    service: 'openai',
    endpointClass: '/organization/projects/{project_id}/api_keys/{api_key_id}',
    callerComponent: 'scripts/sync-openai-usage',
    triggerType: 'usage_reconciliation',
    operationId,
  });
  if (!response.ok) {
    throw new Error(`OpenAI reconciliation API-key preflight failed (${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('OpenAI reconciliation API-key preflight returned invalid JSON.');
  }
  if (String(payload?.id || '') !== expectedApiKeyId) {
    throw new Error('OpenAI reconciliation API-key preflight returned the wrong key identity.');
  }
}

export async function runOpenAIUsageSync({
  adminKey,
  expectedProjectId,
  expectedApiKeyId,
  startTime,
  hours,
  fetchFn = auditedFetch,
  recordSnapshot = recordProviderUsageSnapshot,
  hash = sha256,
  operationId = crypto.randomUUID(),
}) {
  if (!adminKey) throw new Error('An OpenAI organization Admin API key is required.');
  if (!expectedProjectId) throw new Error('An expected OpenAI project ID is required.');
  if (!expectedApiKeyId) throw new Error('An expected OpenAI API key ID is required.');
  const headers = { Authorization: `Bearer ${adminKey}` };

  // An organization-scoped Admin key can otherwise return an empty, apparently
  // successful report for a project/key pair that belongs to another organization.
  await verifyExpectedApiKey({
    expectedProjectId,
    expectedApiKeyId,
    headers,
    operationId,
    fetchFn,
  });

  // Fetch both datasets before writing either one. An API or scope-guard failure
  // therefore cannot leave a misleading, half-reconciled snapshot import.
  const [usageBuckets, costBuckets] = await Promise.all([
    fetchPages({
      path: '/organization/usage/completions',
      parameters: [
        ['start_time', String(startTime)], ['bucket_width', '1h'], ['limit', '168'],
        ['project_ids[]', expectedProjectId], ['api_key_ids[]', expectedApiKeyId],
        ['group_by[]', 'project_id'], ['group_by[]', 'api_key_id'], ['group_by[]', 'model'],
      ],
      headers,
      operationId,
      fetchFn,
    }),
    fetchPages({
      path: '/organization/costs',
      parameters: [
        ['start_time', String(startTime)], ['bucket_width', '1d'], ['limit', '7'], ['group_by[]', 'project_id'],
        ['project_ids[]', expectedProjectId], ['api_key_ids[]', expectedApiKeyId], ['group_by[]', 'api_key_id'],
      ],
      headers,
      operationId,
      fetchFn,
    }),
  ]);

  const usageSnapshots = prepareUsageSnapshots(usageBuckets, expectedProjectId, expectedApiKeyId, hash);
  const costSnapshots = prepareCostSnapshots(costBuckets, expectedProjectId, expectedApiKeyId, hash);
  for (const snapshot of [...usageSnapshots, ...costSnapshots]) await recordSnapshot(snapshot);

  return {
    ok: true,
    usage_rows: usageSnapshots.length,
    cost_rows: costSnapshots.length,
    lookback_hours: hours,
    operation_id: operationId,
  };
}

export async function main(env = process.env) {
  const config = reconciliationConfig(env);
  try {
    const result = await runOpenAIUsageSync(config);
    console.log(JSON.stringify(result));
    return result;
  } finally {
    await closeAuditStore();
  }
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();
