const test = require('node:test');
const assert = require('node:assert/strict');
const { discordRateLimitedFetch, onlyRateLimitedApprovalAttempts, recoverySendFailureStatus } = require('./discord-retry');
test('waits for explicit Discord rate limit and records bounded retries', async () => {
  const attempts = [], waits = [];
  const result = await discordRateLimitedFetch('https://discord.com', { method: 'POST' }, {}, {
    fetchImpl: async (url, init, ctx) => { attempts.push(ctx.retryCount); return attempts.length === 1
      ? new Response('{"retry_after":0.3}', { status: 429 }) : new Response('{"id":"123"}', { status: 200 }); },
    sleep: async ms => waits.push(ms)
  });
  assert.equal(result.status, 200); assert.deepEqual(attempts, [0, 1]); assert.deepEqual(waits, [400]);
});
test('never retries ambiguous sends or unbounded Discord delay', async () => {
  for (const response of [new Response('', { status: 500 }), new Response('{"retry_after":999}', { status: 429 })]) {
    let count = 0;
    await discordRateLimitedFetch('https://discord.com', {}, {}, { fetchImpl: async () => { count++; return response; }, sleep: async () => assert.fail('must not sleep') });
    assert.equal(count, 1);
  }
  let count = 0;
  await assert.rejects(() => discordRateLimitedFetch('https://discord.com', {}, {}, { fetchImpl: async () => { count++; throw new Error('uncertain network'); } }), /uncertain/);
  assert.equal(count, 1);
});
test('reservation recovery needs positive audit proof of only rejected 429 sends', () => {
  const rejected = { response_status: 429, outcome: 'HTTP_ERROR' };
  assert.equal(onlyRateLimitedApprovalAttempts([rejected, rejected]), true);
  for (const rows of [[], [{ response_status: 200, outcome: 'SUCCEEDED' }], [rejected, { response_status: null, outcome: 'NETWORK_ERROR' }], [{ response_status: 500, outcome: 'HTTP_ERROR' }]]) assert.equal(onlyRateLimitedApprovalAttempts(rows), false);
});
test('network or audit uncertainty quarantines recovery even after earlier rate limits', () => {
  assert.equal(recoverySendFailureStatus({ responseStatus: 429 }), 'RECOVERY_RESERVED');
  for (const error of [new Error('audit failed after provider success'), new TypeError('network uncertain'), { responseStatus: 500 }, { responseStatus: 200 }]) {
    assert.equal(recoverySendFailureStatus(error), 'RECOVERY_SEND_UNCERTAIN');
  }
});
