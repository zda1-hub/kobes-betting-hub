const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_IMAGE_BYTES, manualFreePickPacket, publishApprovedFreePickToSite, shouldUseStandaloneXSync, siteConfig } = require('./free-pick-site');

const packet = {
  pick_id: '20260913-NFL-001',
  approval: { image_url: 'https://cdn.example.com/approved-player.png' },
  analysis: {
    extraction: {
      sport: 'football',
      event: 'Atlanta at Pittsburgh',
      selection: 'Bijan Robinson over',
      line: '29.5 receiving yards',
      odds_american: '-140',
      units: '1',
      source_claims: ['Cleared this line in 12 of 17 games'],
      plays: [{
        selection: 'Bijan Robinson over',
        player_name: 'Bijan Robinson',
        line: '29.5 receiving yards',
        odds_american: '-140',
        units: '1',
        event: 'Atlanta at Pittsburgh',
      }],
    },
  },
};

const environment = {
  FREE_PICK_SITE_PUBLISH_URL: 'https://publisher.example/',
  FREE_PICK_SITE_PUBLISH_SECRET: 'test-site-secret',
};

test('requires a dedicated or legacy publisher secret', () => {
  assert.equal(siteConfig({}), null);
  assert.deepEqual(siteConfig({ DAILY_PICKS_QUEUE_SECRET: 'legacy-secret' }), {
    url: 'https://bettinghub-publisher.kobedirwin.workers.dev',
    secret: 'legacy-secret',
  });
});

test('turns an explicitly approved manual Discord pick and attachment into a site packet', () => {
  const result = manualFreePickPacket('20260913-NFL-002', {
    sport: 'football',
    event: 'Atlanta at Pittsburgh',
    pick: 'Bijan Robinson over 29.5 receiving yards',
    publishedLine: 'OVER 29.5 receiving yards',
    publishedOdds: -140,
    unitsRisked: 1,
    evidence: 'First verified point; Second verified point\nThird verified point; Fourth verified point',
    imageUrl: 'https://example.com/lower-priority.png',
    imageAttachmentUrl: 'https://cdn.discordapp.com/approved-upload.png',
  });

  assert.equal(result.pick_id, '20260913-NFL-002');
  assert.equal(result.approval.image_url, 'https://cdn.discordapp.com/approved-upload.png');
  assert.deepEqual(result.analysis.extraction.source_claims, [
    'First verified point',
    'Second verified point',
    'Third verified point',
    'Fourth verified point',
  ]);
  assert.deepEqual(result.analysis.extraction.plays[0], {
    selection: 'Bijan Robinson over 29.5 receiving yards',
    line: 'OVER 29.5 receiving yards',
    odds_american: '-140',
    units: '1',
    event: 'Atlanta at Pittsburgh',
  });
});

test('copies an approved image as typed multipart data and reports combined site/X success', async () => {
  const calls = [];
  const result = await publishApprovedFreePickToSite(packet, {
    environment,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === packet.approval.image_url) {
        return new Response(Uint8Array.of(137, 80, 78, 71), {
          headers: { 'content-type': 'image/png; charset=binary' },
        });
      }
      assert.equal(url, 'https://publisher.example/api/free-pick/publish');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.authorization, 'Bearer test-site-secret');
      assert.equal(options.headers['content-type'], undefined);
      assert.ok(options.body instanceof FormData);
      const image = options.body.get('image');
      assert.ok(image instanceof File);
      assert.equal(image.name, 'free-pick.png');
      assert.equal(image.type, 'image/png');
      assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [137, 80, 78, 71]);
      assert.equal(options.body.get('selection'), 'Bijan Robinson over');
      assert.equal(options.body.get('odds'), '-140');
      assert.match(options.body.get('caption'), /^FREE PLAY\nBijan Robinson over 29\.5 receiving yards \(-140\)$/);
      return Response.json({
        imageUrl: 'https://publisher.example/media/free-pick/current?v=test',
        xPosted: true,
      }, { status: 201 });
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(result, {
    status: 'published',
    image: true,
    xPosted: true,
    xNeedsAttention: false,
  });
});

test('does not send unsupported or oversized media to the image endpoint', async (t) => {
  const originalError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalError; });
  for (const imageResponse of [
    new Response('<html>not an image</html>', { headers: { 'content-type': 'text/html' } }),
    new Response(Uint8Array.of(1), {
      headers: { 'content-type': 'image/jpeg', 'content-length': String(MAX_IMAGE_BYTES + 1) },
    }),
  ]) {
    let publishRequest;
    const result = await publishApprovedFreePickToSite(packet, {
      environment,
      fetchImpl: async (url, options = {}) => {
        if (url === packet.approval.image_url) return imageResponse;
        publishRequest = options;
        return Response.json({ imageUrl: null, xPosted: false }, { status: 201 });
      },
    });

    assert.equal(publishRequest.headers['content-type'], 'application/json');
    assert.equal(JSON.parse(publishRequest.body).details.selection, 'Bijan Robinson over');
    assert.equal(result.image, false);
  }
});

test('surfaces partial image delivery so callers do not enqueue a duplicate text X post', async () => {
  const result = await publishApprovedFreePickToSite(packet, {
    environment,
    fetchImpl: async (url) => {
      if (url === packet.approval.image_url) {
        return new Response(Uint8Array.of(255, 216, 255), { headers: { 'content-type': 'image/jpeg' } });
      }
      return Response.json({
        imageUrl: 'https://publisher.example/media/free-pick/current?v=test',
        xPosted: false,
      }, { status: 202 });
    },
  });

  assert.deepEqual(result, {
    status: 'published',
    image: true,
    xPosted: false,
    xNeedsAttention: true,
  });
  assert.equal(shouldUseStandaloneXSync(result), false);
  assert.equal(shouldUseStandaloneXSync({ status: 'published', image: false }), true);
});
