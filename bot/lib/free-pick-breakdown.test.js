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

test('the original X pick and its replies contain every approved breakdown point once', () => {
  const original = buildFreePickXPost(packet);
  const parts = breakdownParts(packet);
  assert.ok(parts.length > 0);
  assert.ok(parts.every(part => safeXPostLength(part) <= 280));
  for (const claim of claims) assert.equal([original, ...parts].join('\n').split(claim).length - 1, 1);
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
  assert.equal(requests.length, result.replies);
  assert.ok(requests.every((request, index) => request.id.match(/^breakdown-x-123456789-[a-f0-9]{20}-\d{2}$/) && request.body === breakdownParts(packet)[index]));
});
