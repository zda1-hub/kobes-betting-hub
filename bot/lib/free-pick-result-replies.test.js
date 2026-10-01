const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResultReply, resultReplyId, syncFreePickResultReplies } = require('./free-pick-result-replies');

const row = {
  pick_id: '20260930-free-1', operating_date: '2026-09-30', status: 'PUBLISHED',
  published_at: '2026-09-30T18:00:00Z',
  post_reference: 'https://discord.com/channels/123/456/789',
  selection: 'Team A', published_line: '+2.5', published_odds_american: '-110',
  score_or_outcome: 'Team A 24, Team B 20', result: 'W',
  result_verified_source: 'Verified final result: ESPN', result_verified_at: '2026-09-30T23:00:00Z',
};
const environment = {
  FREE_PICK_X_RESULT_REPLIES_ENABLED: 'true', FREE_PICK_X_RESULT_REPLY_START_AT: '2026-09-30T00:00:00Z',
  FREE_PICK_X_PUBLISH_URL: 'https://publisher.test', FREE_PICK_X_QUEUE_SECRET: 'test-secret',
};

test('result copy reports each verified outcome plainly', () => {
  for (const [result, label] of [['W', 'WIN'], ['L', 'LOSS'], ['P', 'PUSH'], ['V', 'VOID']]) {
    assert.match(buildResultReply({ ...row, result }), new RegExp(`FREE PICK RESULT: ${label}`));
  }
  assert.throws(() => buildResultReply({ ...row, result_verified_source: '' }), /not verified/);
  assert.equal(resultReplyId(row.pick_id, '123456789'), resultReplyId(row.pick_id, '123456789'));
});

test('sync waits for an original X receipt and skips unverified results', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/parent?')) return new Response(JSON.stringify({ error: 'missing' }), { status: 404 });
    throw new Error('No result reply should be submitted');
  };
  const receipts = await syncFreePickResultReplies([row, { ...row, pick_id: 'pending', result: 'PENDING' }], '456', { environment, fetchImpl });
  assert.equal(calls.length, 1);
  assert.deepEqual(receipts.map((item) => item.status), ['awaiting_original_post']);
});

test('sync submits one reply request tied to the confirmed parent', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/parent?')) return new Response(JSON.stringify({ xPostId: '123456789' }));
    return new Response('{}', { status: 201 });
  };
  const receipts = await syncFreePickResultReplies([row], '456', { environment, fetchImpl });
  assert.equal(receipts[0].status, 'requested');
  const submitted = JSON.parse(calls[1].init.body);
  assert.match(submitted.id, /^result-x-123456789-[a-f0-9]{20}$/);
  assert.match(submitted.body, /FREE PICK RESULT: WIN/);
});
