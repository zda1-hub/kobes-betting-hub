const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFreePickXPost, freePickXPostId, freePickXSyncConfig, syncApprovedFreePickToX } = require('./free-pick-x');

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
  assert.equal(buildFreePickXPost(packet), 'FREE PLAY\nArizona Diamondbacks ML - -115\n\nLive now in the Hub.');
  assert.match(freePickXPostId(packet.pick_id), /^free-x-[a-f0-9]{40}$/);
});

test('leaves X sync disabled unless explicitly enabled', () => {
  assert.equal(freePickXSyncConfig({}), null);
  assert.throws(() => freePickXSyncConfig({ FREE_PICK_X_SYNC_ENABLED: 'true' }), /requires/);
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
