const test = require('node:test');
const assert = require('node:assert/strict');
const { publishApprovedFreePickToSite, siteConfig } = require('./free-pick-site');

const packet = {
  pick_id: 'image-free-pick-test',
  approval: { image_url: 'https://media.test/free-pick.png' },
  analysis: {
    extraction: {
      sport: 'NFL',
      event: 'ATL @ PIT',
      selection: 'Bijan Robinson over 29.5 receiving yards',
      line: '29.5 receiving yards',
      odds_american: '-140',
      units: '1u',
      source_claims: [
        'Bijan averaged 48.2 receiving yards per game last season',
        'He cleared 29.5 in 12 of 17 games',
        'His median was 38 receiving yards',
        'He cleared the line in 7 of his last 10 games'
      ],
      plays: [{
        selection: 'Bijan Robinson over 29.5 receiving yards',
        line: '29.5 receiving yards',
        odds_american: '-140',
        units: '1u'
      }]
    }
  }
};

test('image-backed Free Pick copies exact approved image bytes into one multipart publish', async () => {
  const expectedBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const storyBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 8, 7, 6]);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === packet.approval.image_url) {
      return new Response(expectedBytes, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return new Response(JSON.stringify({
      imageUrl: 'https://publisher.test/media/free-pick/current',
      storyUrl: 'https://publisher.test/media/free-pick/story/2026-09-14',
      xPosted: true,
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  };

  const result = await publishApprovedFreePickToSite(packet, {
    fetchImpl,
    environment: {
      FREE_PICK_SITE_PUBLISH_URL: 'https://publisher.test',
      FREE_PICK_SITE_PUBLISH_SECRET: 'fixture-secret'
    },
    storyRenderer: async () => storyBytes,
  });

  assert.deepEqual(result, {
    status: 'published', image: true,
    storyUrl: 'https://publisher.test/media/free-pick/story/2026-09-14', xPosted: true,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, packet.approval.image_url);
  assert.equal(calls[1].url, 'https://publisher.test/api/free-pick/publish');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.authorization, 'Bearer fixture-secret');
  assert.ok(calls[1].init.body instanceof FormData);

  const image = calls[1].init.body.get('image');
  assert.equal(image.type, 'image/png');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), expectedBytes);
  const story = calls[1].init.body.get('story');
  assert.equal(story.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await story.arrayBuffer()), storyBytes);
  assert.match(calls[1].init.body.get('caption'), /^TODAY’S FREE PICK/);
  assert.match(calls[1].init.body.get('caption'), /Bijan Robinson over 29\.5 receiving yards/);
  assert.match(calls[1].init.body.get('caption'), /QUICK BREAKDOWN/);
  assert.match(calls[1].init.body.get('caption'), /Legal age where you live\. Bet responsibly\.$/);
  assert.ok(calls[1].init.body.get('caption').length <= 280);
  assert.equal(calls[1].init.body.get('selection'), 'Bijan Robinson over 29.5 receiving yards');
});

test('image retrieval failure falls back to one text-only publish', async () => {
  const storyBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === packet.approval.image_url) throw new Error('fixture media unavailable');
    return new Response(JSON.stringify({ imageUrl: null, storyUrl: 'https://publisher.test/media/free-pick/story/2026-09-14', xPosted: false }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  };

  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await publishApprovedFreePickToSite(packet, {
      fetchImpl,
      environment: {
        FREE_PICK_SITE_PUBLISH_URL: 'https://publisher.test',
        FREE_PICK_SITE_PUBLISH_SECRET: 'fixture-secret'
      },
      storyRenderer: async () => storyBytes,
    });
    assert.deepEqual(result, {
      status: 'published', image: false,
      storyUrl: 'https://publisher.test/media/free-pick/story/2026-09-14', xPosted: false,
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(calls.length, 2);
  assert.ok(calls[1].init.body instanceof FormData);
  assert.equal(calls[1].init.body.get('image'), null);
  assert.equal(calls[1].init.body.get('story').type, 'image/jpeg');
  assert.match(calls[1].init.body.get('caption'), /^TODAY’S FREE PICK/);
  assert.match(calls[1].init.body.get('caption'), /Bijan Robinson over 29\.5 receiving yards/);
});

test('falls back to JSON when both source media and Story rendering fail', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === packet.approval.image_url) throw new Error('fixture media unavailable');
    return new Response(JSON.stringify({ imageUrl: null, storyUrl: null, xPosted: false }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await publishApprovedFreePickToSite(packet, {
      fetchImpl,
      environment: {
        FREE_PICK_SITE_PUBLISH_URL: 'https://publisher.test',
        FREE_PICK_SITE_PUBLISH_SECRET: 'fixture-secret',
      },
      storyRenderer: async () => { throw new Error('fixture story unavailable'); },
    });
    assert.deepEqual(result, { status: 'published', image: false, storyUrl: null, xPosted: false });
  } finally {
    console.error = originalError;
  }
  assert.equal(calls[1].init.headers['content-type'], 'application/json');
});

test('Free Pick site publishing remains disabled without a dedicated credential', () => {
  assert.equal(siteConfig({}), null);
});
