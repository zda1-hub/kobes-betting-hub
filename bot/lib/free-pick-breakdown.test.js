const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFreePickXPost, safeXPostLength } = require('./free-pick-x');
const { breakdownParts, syncApprovedFreePickBreakdown } = require('./free-pick-breakdown');

const claims = [
  'Arizona won seven of its previous ten games',
  'The starter allowed two or fewer earned runs in four straight starts',
  'The bullpen pitched five innings in the previous game',
  'Arizona has the rest advantage after an off day',
];
const packet = {
  pick_id: '20261113-MLB-001', operating_date: '2026-11-13',
  analysis: { extraction: { is_pick_candidate: true, plays: [{
    selection: 'Arizona Diamondbacks ML', line: '-', odds_american: '-115', source_claims: claims,
  }] } },
};

test('one complete reply contains every approved breakdown point', () => {
  const original = buildFreePickXPost(packet);
  const parts = breakdownParts(packet);
  assert.equal(parts.length, 1);
  assert.match(parts[0], /^Full breakdown:/);
  assert.match(original, /Arizona Diamondbacks ML/);
  for (const claim of claims) assert.equal(parts[0].split(claim).length - 1, 1);
});

test('breakdown replies use stable IDs and never queue a duplicate on retry', async () => {
  const requests = [];
  const result = await syncApprovedFreePickBreakdown(packet, {
    environment: { FREE_PICK_X_SYNC_ENABLED: 'true', FREE_PICK_X_PUBLISH_URL: 'https://publisher.test', FREE_PICK_X_QUEUE_SECRET: 'test' },
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes('/parent?')) return Response.json({ xPostId: '123456789' });
      const body = JSON.parse(options.body);
      requests.push(body);
      return Response.json({ id: body.id, status: 'published' }, { status: 201 });
    },
  });
  assert.equal(result.status, 'published');
  assert.equal(result.replies, 1);
  assert.equal(requests.length, 1);
  assert.match(requests[0].id, /^breakdown-x-123456789-[a-f0-9]{20}-00$/);
  assert.equal(requests[0].body, breakdownParts(packet)[0]);
});

test('a breakdown too long for one reply is held rather than split', () => {
  const oversized = structuredClone(packet);
  oversized.analysis.extraction.plays[0].source_claims = Array.from({ length: 8 }, (_, i) => `Verified claim ${i}: ${'long '.repeat(120)}`);
  assert.throws(() => breakdownParts(oversized), /exceeds one X reply/);
});
