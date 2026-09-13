import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareCostSnapshots,
  prepareUsageSnapshots,
  reconciliationConfig,
  runOpenAIUsageSync,
} from './sync-openai-usage.mjs';

const expectedProjectId = 'proj_expected';
const expectedApiKeyId = 'key_production';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function usageBucket(projectId = expectedProjectId, start = 1_725_000_000, apiKeyId = expectedApiKeyId) {
  return {
    start_time: start,
    end_time: start + 3600,
    results: [{
      project_id: projectId,
      api_key_id: apiKeyId,
      model: 'gpt-5.6-luna',
      num_model_requests: 2,
      input_tokens: 120,
      input_cached_tokens: 20,
      output_tokens: 30,
    }],
  };
}

function costBucket(projectId = expectedProjectId, apiKeyId = expectedApiKeyId) {
  return {
    start_time: 1_724_947_200,
    end_time: 1_725_033_600,
    results: [{ project_id: projectId, api_key_id: apiKeyId, amount: { value: 0.0012, currency: 'usd' } }],
  };
}

test('one operation ID covers usage and cost pagination before snapshots are recorded', async () => {
  const calls = [];
  const recorded = [];
  const fetchFn = async (url, options, context) => {
    calls.push({ url: new URL(url), options, context });
    const target = new URL(url);
    if (target.pathname.endsWith(`/api_keys/${expectedApiKeyId}`)) {
      return jsonResponse({ id: expectedApiKeyId, object: 'organization.project.api_key' });
    }
    if (target.pathname.endsWith('/usage/completions')) {
      return target.searchParams.get('page') === 'usage-page-2'
        ? jsonResponse({ data: [usageBucket(expectedProjectId, 1_725_003_600)], has_more: false })
        : jsonResponse({ data: [usageBucket()], has_more: true, next_page: 'usage-page-2' });
    }
    return jsonResponse({ data: [costBucket()], has_more: false });
  };

  const result = await runOpenAIUsageSync({
    adminKey: 'test-admin-key',
    expectedProjectId,
    expectedApiKeyId,
    startTime: 1_724_947_200,
    hours: 48,
    operationId: 'reconciliation-run-1',
    fetchFn,
    recordSnapshot: async (snapshot) => recorded.push(snapshot),
    hash: (value) => JSON.stringify(value),
  });

  assert.equal(result.usage_rows, 2);
  assert.equal(result.cost_rows, 1);
  assert.equal(result.operation_id, 'reconciliation-run-1');
  assert.equal(calls.length, 4);
  assert.deepEqual(new Set(calls.map(({ context }) => context.operationId)), new Set(['reconciliation-run-1']));
  assert.equal(calls[0].context.endpointClass, '/organization/projects/{project_id}/api_keys/{api_key_id}');
  assert.equal(
    calls.find(({ url }) => url.searchParams.get('page') === 'usage-page-2')?.url.searchParams.get('page'),
    'usage-page-2',
  );
  assert.equal(recorded.length, 3);
  const usageCall = calls.find(({ url }) => url.pathname.endsWith('/usage/completions') && !url.searchParams.has('page'));
  const costCall = calls.find(({ url }) => url.pathname.endsWith('/organization/costs'));
  for (const call of [usageCall, costCall]) {
    assert.deepEqual(call.url.searchParams.getAll('project_ids[]'), [expectedProjectId]);
    assert.deepEqual(call.url.searchParams.getAll('api_key_ids[]'), [expectedApiKeyId]);
  }
  assert.deepEqual(costCall.url.searchParams.getAll('group_by[]'), ['project_id', 'api_key_id']);
  assert.equal(recorded.find(({ source }) => source === 'openai_costs_api').apiKeyReference, expectedApiKeyId);
});

test('snapshot preparation is deterministic for repeat-safe database upserts', () => {
  const usage = [usageBucket()];
  const costs = [costBucket()];
  const stableHash = (value) => JSON.stringify(value);

  assert.deepEqual(
    prepareUsageSnapshots(usage, expectedProjectId, expectedApiKeyId, stableHash),
    prepareUsageSnapshots(usage, expectedProjectId, expectedApiKeyId, stableHash),
  );
  assert.deepEqual(
    prepareCostSnapshots(costs, expectedProjectId, expectedApiKeyId, stableHash),
    prepareCostSnapshots(costs, expectedProjectId, expectedApiKeyId, stableHash),
  );
});

test('production-project guard rejects an unexpected usage project before any writes', async () => {
  const recorded = [];
  const fetchFn = async (url) => {
    if (String(url).includes('/api_keys/')) return jsonResponse({ id: expectedApiKeyId });
    return String(url).includes('/usage/completions')
      ? jsonResponse({ data: [usageBucket('proj_wrong')], has_more: false })
      : jsonResponse({ data: [costBucket()], has_more: false });
  };

  await assert.rejects(
    runOpenAIUsageSync({
      adminKey: 'test-admin-key', expectedProjectId, expectedApiKeyId, startTime: 1, hours: 48,
      fetchFn, recordSnapshot: async (snapshot) => recorded.push(snapshot),
    }),
    /scope guard rejected usage data/,
  );
  assert.equal(recorded.length, 0);
});

test('production-project guard also rejects an unexpected cost project before any writes', async () => {
  const recorded = [];
  const fetchFn = async (url) => {
    if (String(url).includes('/api_keys/')) return jsonResponse({ id: expectedApiKeyId });
    return String(url).includes('/usage/completions')
      ? jsonResponse({ data: [usageBucket()], has_more: false })
      : jsonResponse({ data: [costBucket('proj_wrong')], has_more: false });
  };

  await assert.rejects(
    runOpenAIUsageSync({
      adminKey: 'test-admin-key', expectedProjectId, expectedApiKeyId, startTime: 1, hours: 48,
      fetchFn, recordSnapshot: async (snapshot) => recorded.push(snapshot),
    }),
    /scope guard rejected cost data/,
  );
  assert.equal(recorded.length, 0);
});

test('partial provider failure writes nothing and does not leak response or credential text', async () => {
  const recorded = [];
  const secret = 'sk-admin-must-not-appear';
  const echoedSecret = 'provider-echoed-sensitive-value';
  const fetchFn = async (url) => {
    if (String(url).includes('/api_keys/')) return jsonResponse({ id: expectedApiKeyId });
    return String(url).includes('/organization/costs')
      ? jsonResponse({ error: { message: `${echoedSecret} ${secret}` } }, 500)
      : jsonResponse({ data: [usageBucket()], has_more: false });
  };

  let failure;
  try {
    await runOpenAIUsageSync({
      adminKey: secret, expectedProjectId, expectedApiKeyId, startTime: 1, hours: 48,
      fetchFn, recordSnapshot: async (snapshot) => recorded.push(snapshot),
    });
  } catch (error) {
    failure = error;
  }

  assert.match(failure.message, /failed \(500\)/);
  assert.doesNotMatch(failure.message, new RegExp(secret));
  assert.doesNotMatch(failure.message, new RegExp(echoedSecret));
  assert.equal(recorded.length, 0);
});

test('API-key preflight prevents a wrong organization from looking like an empty report', async () => {
  const calls = [];
  const recorded = [];
  const fetchFn = async (url) => {
    calls.push(String(url));
    return jsonResponse({ error: { message: 'not found' } }, 404);
  };

  await assert.rejects(
    runOpenAIUsageSync({
      adminKey: 'test-admin-key', expectedProjectId, expectedApiKeyId, startTime: 1, hours: 48,
      fetchFn, recordSnapshot: async (snapshot) => recorded.push(snapshot),
    }),
    /API-key preflight failed \(404\)/,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(`/projects/${expectedProjectId}/api_keys/${expectedApiKeyId}$`));
  assert.equal(recorded.length, 0);
});

test('scope guard rejects the wrong API key ID before any writes', async () => {
  const recorded = [];
  const fetchFn = async (url) => {
    if (String(url).includes('/api_keys/')) return jsonResponse({ id: expectedApiKeyId });
    return String(url).includes('/usage/completions')
      ? jsonResponse({ data: [usageBucket(expectedProjectId, 1_725_000_000, 'key_wrong')], has_more: false })
      : jsonResponse({ data: [costBucket()], has_more: false });
  };

  await assert.rejects(
    runOpenAIUsageSync({
      adminKey: 'test-admin-key', expectedProjectId, expectedApiKeyId, startTime: 1, hours: 48,
      fetchFn, recordSnapshot: async (snapshot) => recorded.push(snapshot),
    }),
    /scope guard rejected usage data/,
  );
  assert.equal(recorded.length, 0);
});

test('configuration requires both expected scope guard identifiers', () => {
  assert.throws(() => reconciliationConfig({
    OPENAI_ADMIN_KEY: 'test-admin-key',
    DATABASE_URL: 'postgres://test.invalid/example',
  }), /OPENAI_EXPECTED_PROJECT_ID/);
  assert.throws(() => reconciliationConfig({
    OPENAI_ADMIN_KEY: 'test-admin-key',
    DATABASE_URL: 'postgres://test.invalid/example',
    OPENAI_EXPECTED_PROJECT_ID: expectedProjectId,
  }), /OPENAI_EXPECTED_API_KEY_ID/);
});
