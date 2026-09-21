import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./bettinghub-publisher.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const worker = workerModule.default;
const workerTest = workerModule.__test;

function auditDb() {
  const prepared = [];
  const records = [];
  return {
    prepared,
    records,
    prepare(sql) {
      const statement = {
        sql,
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        },
        async run() {
          if (/INSERT INTO x_api_call_audit/.test(sql)) records.push([...this.bindings]);
          return { meta: { changes: 1 } };
        },
      };
      prepared.push(statement);
      return statement;
    },
    async batch() {
      return [];
    },
  };
}

function memoryKv() {
  const values = new Map();
  return {
    async put(key, value, options = {}) {
      values.set(key, { value, metadata: options.metadata || null });
    },
    async get(key, type) {
      const value = values.get(key)?.value;
      if (value == null) return null;
      if (type === 'text' && typeof value !== 'string') return new TextDecoder().decode(value);
      return value;
    },
    async getWithMetadata(key) {
      const stored = values.get(key);
      if (!stored) return { value: null, metadata: null };
      const value = typeof stored.value === 'string' ? new TextEncoder().encode(stored.value).buffer : stored.value;
      return { value, metadata: stored.metadata };
    },
  };
}

test('VIP preview feed strips all private fields and expires by operating date', async () => {
  const env = { FREE_PICK_KV: memoryKv(), FREE_PICK_SITE_PUBLISH_SECRET: 'fixture-secret' };
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const input = { date, previews: [{ sport: 'football', topics: ['Recent production', 'Giants allow 8 catches'], selection: 'Higbee Over 4.5', team: 'Rams', market: 'receptions' }] };
  const put = await worker.fetch(new Request('https://publisher.test/api/vip-preview/current', { method: 'PUT', headers: { authorization: 'Bearer fixture-secret', 'content-type': 'application/json' }, body: JSON.stringify(input) }), env);
  assert.equal(put.status, 200);
  const response = await worker.fetch(new Request('https://publisher.test/api/vip-preview/current'), env);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /Higbee|Giants|Rams|4\.5|receptions/);
  assert.deepEqual(JSON.parse(body).previews[0].topics, ['Recent production']);
  const unauthorized = await worker.fetch(new Request('https://publisher.test/api/vip-preview/current', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }), env);
  assert.equal(unauthorized.status, 401);
});

test('text-only Free Pick remains readable after publication', async () => {
  const env = {
    FREE_PICK_KV: memoryKv(),
    FREE_PICK_SITE_PUBLISH_SECRET: 'test-publisher-secret',
  };
  const publishResponse = await worker.fetch(new Request('https://publisher.test/api/free-pick/publish', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-publisher-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      date: '2026-09-12',
      caption: 'FREE PLAY\nBijan Robinson over 29.5 receiving yards',
      details: { selection: 'Bijan Robinson over 29.5 receiving yards' },
    }),
  }), env);
  assert.equal(publishResponse.status, 201);

  const currentResponse = await worker.fetch(new Request('https://publisher.test/api/free-pick/current'), env);
  assert.equal(currentResponse.status, 200);
  const current = await currentResponse.json();
  assert.equal(current.publishedDate, '2026-09-12');
  assert.equal(current.details.selection, 'Bijan Robinson over 29.5 receiving yards');
  assert.equal(current.imageUrl, null);
  assert.equal(current.storyUrl, null);
});

test('verified Free Pick results require authorization and expose only the approved snapshot', async () => {
  const env = { FREE_PICK_KV: memoryKv(), FREE_PICK_SITE_PUBLISH_SECRET: 'test-publisher-secret' };
  const snapshot = {
    generatedAt: '2026-09-21T23:00:00.000Z', operatingDate: '2026-09-21',
    overall: { wins: 2, losses: 1, pushes: 1, voids: 0 },
    today: { wins: 1, losses: 1, pushes: 0, voids: 0 }, pending: 2,
    recentWins: [{ date: '2026-09-21', selection: 'Test free pick', line: '+3.5', odds: '-110', netUnits: 0.91, postUrl: 'https://discord.com/channels/1/2/3', secret: 'do not expose' }],
    bestWins: [], secret: 'do not expose',
  };
  const url = 'https://publisher.test/api/free-pick/results';
  const submit = (body, token = 'test-publisher-secret') => worker.fetch(new Request(url, {
    method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env);
  assert.equal((await submit(snapshot, 'wrong')).status, 401);
  assert.equal((await submit(snapshot)).status, 200);
  const response = await worker.fetch(new Request(url), env);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.doesNotMatch(body, /do not expose/);
  assert.equal(JSON.parse(body).overall.losses, 1);
  assert.equal((await submit({ ...snapshot, generatedAt: '2026-09-20T23:00:00.000Z' })).status, 409);
  assert.equal((await submit({ ...snapshot, recentWins: [{ ...snapshot.recentWins[0], postUrl: 'https://example.com/private' }] })).status, 400);
});

test('stores and serves a dated Instagram Story without publishing it to X', async () => {
  const store = memoryKv();
  const storyBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).buffer;
  const form = new FormData();
  form.set('date', '2026-09-14');
  form.set('caption', 'FREE PLAY\nArizona over 20.5 points');
  form.set('selection', 'Arizona over 20.5 points');
  form.set('story', new File([storyBytes], 'story.jpg', { type: 'image/jpeg' }));
  const env = { FREE_PICK_KV: store, FREE_PICK_SITE_PUBLISH_SECRET: 'test-publisher-secret' };
  const publishResponse = await worker.fetch(new Request('https://publisher.test/api/free-pick/publish', {
    method: 'POST', headers: { authorization: 'Bearer test-publisher-secret' }, body: form,
  }), env);
  assert.equal(publishResponse.status, 201);
  const published = await publishResponse.json();
  assert.equal(published.imageUrl, null);
  assert.equal(published.xPosted, false);
  assert.equal(published.storyUrl, 'https://publisher.test/media/free-pick/story/2026-09-14');

  const storyResponse = await worker.fetch(new Request(published.storyUrl), env);
  assert.equal(storyResponse.status, 200);
  assert.equal(storyResponse.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await storyResponse.arrayBuffer()), new Uint8Array(storyBytes));
});

test('recap delivery can start at activation without releasing the old backlog', async () => {
  const statements = [];
  const env = {
    RECAP_NOTIFICATION_QUEUE_SECRET: 'recap-secret',
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          bindings: [],
          bind(...values) { this.bindings = values; return this; },
          async all() { return { results: [] }; },
          async run() { return { meta: { changes: 0 } }; },
        };
        statements.push(statement);
        return statement;
      },
      async batch() { return []; },
    },
  };
  const response = await worker.fetch(new Request('https://publisher.test/api/queue/recap-notifications?after=2026-09-14T02%3A00%3A00.000Z', {
    headers: { authorization: 'Bearer recap-secret' },
  }), env);
  assert.equal(response.status, 200);
  const select = statements.find((statement) => /SELECT id, recipient, subject/.test(statement.sql));
  assert.match(select.sql, /created_at >= \?/);
  assert.deepEqual(select.bindings, ['2026-09-14T02:00:00.000Z']);

  const invalid = await worker.fetch(new Request('https://publisher.test/api/queue/recap-notifications?after=not-a-date', {
    headers: { authorization: 'Bearer recap-secret' },
  }), env);
  assert.equal(invalid.status, 400);
});

test('isolated staging health does not require an X binding or OAuth table', async () => {
  const response = await worker.fetch(new Request('https://publisher.test/health'), {
    FREE_PICK_KV: memoryKv(),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: 'bettinghub-publisher',
    status: 'ready',
    xConnected: false,
    freePickReady: true,
  });
});

test('audited X fetch writes a durable redacted D1 record with Worker attribution', async () => {
  const db = auditDb();
  const env = { DB: db, CF_VERSION_METADATA: { id: 'publisher-version-test' } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'response-secret-token',
    refresh_token: 'response-refresh-token',
    data: { id: 'private-provider-object-id' },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': 'x-request-test' },
  });
  try {
    const response = await workerTest.auditedXFetch(env, 'https://api.x.com/2/oauth2/token', {
      method: 'POST',
      body: 'grant_type=authorization_code&code=private-oauth-code',
    }, {
      triggerType: 'oauth_callback',
      requestShape: { authorizationCodePresent: true, grantType: 'authorization_code', verifierPresent: true },
    });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(db.records.length, 1);
  const [id, occurredAt, endpointClass, method, triggerType, outcome, responseStatus, latencyMs, providerRequestId, requestHash, responseHash, workerVersion] = db.records[0];
  assert.match(id, /^[0-9a-f-]{36}$/i);
  assert.ok(Number.isFinite(Date.parse(occurredAt)));
  assert.equal(endpointClass, '/2/oauth2/token');
  assert.equal(method, 'POST');
  assert.equal(triggerType, 'oauth_callback');
  assert.equal(outcome, 'SUCCEEDED');
  assert.equal(responseStatus, 200);
  assert.ok(Number.isInteger(latencyMs) && latencyMs >= 0);
  assert.equal(providerRequestId, 'x-request-test');
  assert.match(requestHash, /^[0-9a-f]{64}$/);
  assert.match(responseHash, /^[0-9a-f]{64}$/);
  assert.equal(workerVersion, 'publisher-version-test');

  const persisted = JSON.stringify({ sql: db.prepared.map((item) => item.sql), bindings: db.records });
  for (const forbidden of ['private-oauth-code', 'response-secret-token', 'response-refresh-token', 'private-provider-object-id']) {
    assert.equal(persisted.includes(forbidden), false);
  }
  assert.ok(db.prepared.some((item) => item.sql.includes('CREATE TABLE IF NOT EXISTS x_api_call_audit')));
  assert.ok(db.prepared.some((item) => item.sql.includes('BEFORE UPDATE ON x_api_call_audit')));
  assert.ok(db.prepared.some((item) => item.sql.includes('BEFORE DELETE ON x_api_call_audit')));
});

test('audited X fetch records HTTP and network failures without retaining payloads', async () => {
  const db = auditDb();
  const env = { DB: db, WORKER_VERSION: 'fallback-version-test' };
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) return new Response(JSON.stringify({ detail: 'private provider failure detail' }), { status: 429, headers: { 'x-transaction-id': 'x-transaction-test' } });
    throw new Error('private network failure detail');
  };
  try {
    const response = await workerTest.auditedXFetch(env, 'https://api.x.com/2/tweets', {
      method: 'POST', body: JSON.stringify({ text: 'private approved tweet text' }),
    }, {
      triggerType: 'scheduled_dispatch', requestShape: { mediaCount: 0, textPresent: true },
    });
    assert.equal(response.status, 429);
    await assert.rejects(() => workerTest.auditedXFetch(env, 'https://api.x.com/2/media/upload', {
      method: 'POST', body: JSON.stringify({ media: 'private-media-bytes' }),
    }, {
      triggerType: 'free_pick_publish', requestShape: { mediaCategory: 'tweet_image', mediaPresent: true },
    }), /private network failure detail/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(db.records.length, 2);
  assert.equal(db.records[0][5], 'HTTP_ERROR');
  assert.equal(db.records[0][6], 429);
  assert.equal(db.records[0][8], 'x-transaction-test');
  assert.equal(db.records[1][5], 'NETWORK_ERROR');
  assert.equal(db.records[1][6], null);
  assert.equal(db.records[1][8], null);
  assert.equal(db.records[1][10], null);
  assert.equal(db.records[1][11], 'fallback-version-test');
  const persisted = JSON.stringify(db.records);
  for (const forbidden of ['private approved tweet text', 'private-media-bytes', 'private provider failure detail', 'private network failure detail']) {
    assert.equal(persisted.includes(forbidden), false);
  }
});

test('response-shape redaction removes every scalar value before hashing', () => {
  assert.deepEqual(workerTest.redactedResponseShape({
    data: { id: 'private-id', count: 3, active: true },
    errors: [{ message: 'private message' }],
  }), {
    data: { active: '<boolean>', count: '<number>', id: '<string>' },
    errors: [{ message: '<string>' }],
  });
});

test('every X media, post, refresh, and exchange call is routed through the audit wrapper', () => {
  assert.equal((source.match(/auditedXFetch\(env, MEDIA_UPLOAD_ENDPOINT/g) || []).length, 1);
  assert.equal((source.match(/auditedXFetch\(env, CREATE_POST_ENDPOINT/g) || []).length, 2);
  assert.equal((source.match(/auditedXFetch\(env, TOKEN_ENDPOINT/g) || []).length, 2);
  assert.equal(/\bfetch\((?:MEDIA_UPLOAD_ENDPOINT|CREATE_POST_ENDPOINT|TOKEN_ENDPOINT)/.test(source), false);
});
