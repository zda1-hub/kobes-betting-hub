const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFreePickXPost, freePickXPostId, freePickXSyncConfig, shouldRunTextXFallback, syncApprovedFreePickToX } = require('./free-pick-x');

const packet = {
  pick_id: '20260829-MLB-001',
  analysis: {
    extraction: {
      is_pick_candidate: true,
      plays: [{ selection: 'Arizona Diamondbacks ML', line: '-', odds_american: '-115' }]
    }
  }
};

test('formats the approved free pick as a compact X post', () => {
  assert.equal(buildFreePickXPost(packet), 'TODAY’S FREE PICK\n\nArizona Diamondbacks ML -115\n\nFull writeup → kobesbettinghub.com/free-pick?utm_source=kobe_x\nLegal age where you live. Bet responsibly.');
  assert.match(freePickXPostId(packet.pick_id), /^free-x-[a-f0-9]{40}$/);
});

test('adds complete verified evidence bullets when they fit', () => {
  const evidencePacket = structuredClone(packet);
  evidencePacket.analysis.extraction.plays[0].source_claims = [
    'Arizona has won 7 of its last 10 games',
    'The starter allowed two or fewer earned runs in four straight starts',
    'This deliberately long supporting claim should be omitted in full rather than cut into a misleading fragment because the post has no remaining room for it at all'
  ];

  const body = buildFreePickXPost(evidencePacket);
  assert.match(body, /• Arizona has won 7 of its last 10 games/);
  assert.match(body, /QUICK BREAKDOWN/);
  assert.doesNotMatch(body, /• The starter allowed two or fewer earned runs in four straight starts/);
  assert.doesNotMatch(body, /deliberately long/);
  assert.ok(body.length <= 280);
});

test('never truncates evidence or removes approved wager terms to fit X', () => {
  const longEvidencePacket = structuredClone(packet);
  const longClaim = `Arizona ${'recorded a verified matchup advantage '.repeat(8)}`.trim();
  longEvidencePacket.analysis.extraction.plays[0].source_claims = [longClaim];

  const body = buildFreePickXPost(longEvidencePacket);
  assert.match(body, /Arizona Diamondbacks ML -115/);
  assert.doesNotMatch(body, /matchup advantage/);
  assert.match(body, /Legal age where you live\. Bet responsibly\./);
  assert.ok(body.length <= 280);
});

test('fails closed when mandatory approved terms cannot fit safely', () => {
  const oversizedPacket = structuredClone(packet);
  oversizedPacket.analysis.extraction.plays[0].selection = `Arizona ${'Diamondbacks '.repeat(30)}ML`;
  assert.throws(() => buildFreePickXPost(oversizedPacket), /before evidence/);
});

test('leaves X sync disabled unless explicitly enabled', () => {
  assert.equal(freePickXSyncConfig({}), null);
  assert.throws(() => freePickXSyncConfig({ FREE_PICK_X_SYNC_ENABLED: 'true' }), /requires/);
});

test('does not queue a duplicate text post when the website already posted the image to X', () => {
  assert.equal(shouldRunTextXFallback({ xPosted: true }), false);
  assert.equal(shouldRunTextXFallback({ xPosted: false }), true);
  assert.equal(shouldRunTextXFallback(null), true);
});

test('sends one idempotent immediate request when sync is enabled', async () => {
  let received;
  const result = await syncApprovedFreePickToX(packet, {
    environment: {
      FREE_PICK_X_SYNC_ENABLED: 'true',
      FREE_PICK_X_PUBLISH_URL: 'https://publisher.example/',
      FREE_PICK_X_QUEUE_SECRET: 'test-secret'
    },
    fetchImpl: async (url, options) => {
      received = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ id: 'free-x-test', status: 'published' }), { status: 201 });
    }
  });

  assert.equal(result.status, 'published');
  assert.equal(received.url, 'https://publisher.example/api/queue/x');
  assert.equal(received.options.headers.authorization, 'Bearer test-secret');
  assert.equal(received.body.publishNow, true);
  assert.match(received.body.id, /^free-x-[a-f0-9]{40}$/);
});
