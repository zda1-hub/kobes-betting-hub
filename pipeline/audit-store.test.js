const test = require('node:test');
const assert = require('node:assert/strict');
const {
  estimateOpenAICost,
  evaluateOpenAIBudget,
  initializeAuditStore,
  openAIBudgetLimits,
  sha256,
  usageFromResponse
} = require('./audit-store');

test('captures Responses usage including cached and image token details', () => {
  assert.deepEqual(usageFromResponse({ usage: {
    input_tokens: 1200,
    input_tokens_details: { cached_tokens: 200, image_tokens: 700 },
    output_tokens: 100
  } }), { inputTokens: 1200, cachedInputTokens: 200, imageTokens: 700, outputTokens: 100 });
});

test('estimates gpt-5-mini cost from recorded input and output usage', () => {
  assert.equal(estimateOpenAICost('gpt-5-mini', { inputTokens: 1_000_000, outputTokens: 1_000_000 }, {}), 2.25);
  assert.equal(estimateOpenAICost('unknown-model', { inputTokens: 10, outputTokens: 10 }, {}), null);
});

test('estimates Luna cost and discounts cached input tokens', () => {
  assert.equal(estimateOpenAICost('gpt-5.6-luna', {
    inputTokens: 1_000_000,
    cachedInputTokens: 500_000,
    outputTokens: 1_000_000
  }, {}), 1.31);
});

test('hashes exact rendered payloads deterministically', () => {
  assert.equal(sha256({ embeds: [{ description: 'A' }] }), sha256({ embeds: [{ description: 'A' }] }));
  assert.notEqual(sha256('A'), sha256('B'));
});

test('fails closed when production requires an audit database without a URL', async () => {
  const previousRequired = process.env.AUDIT_DATABASE_REQUIRED;
  const previousUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env.AUDIT_DATABASE_REQUIRED = 'true';
  try {
    await assert.rejects(initializeAuditStore(), /DATABASE_URL is not configured/);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousRequired === undefined) delete process.env.AUDIT_DATABASE_REQUIRED;
    else process.env.AUDIT_DATABASE_REQUIRED = previousRequired;
  }
});

test('parses only positive OpenAI budget limits', () => {
  assert.deepEqual(openAIBudgetLimits({
    OPENAI_DAILY_REQUEST_LIMIT: '50',
    OPENAI_MONTHLY_REQUEST_LIMIT: '0',
    OPENAI_DAILY_BUDGET_USD: '1',
    OPENAI_MONTHLY_BUDGET_USD: '15'
  }), { dailyRequests: 50, monthlyRequests: null, dailyUsd: 1, monthlyUsd: 15 });
});

test('blocks OpenAI before a call when any configured limit is reached', () => {
  const result = evaluateOpenAIBudget(
    { dailyRequests: 50, monthlyRequests: 100, dailyUsd: 0.2, monthlyUsd: 2 },
    { dailyRequests: 50, monthlyRequests: 500, dailyUsd: 1, monthlyUsd: 15 }
  );
  assert.equal(result.allowed, false);
  assert.match(result.reason, /daily request limit reached/);
});
