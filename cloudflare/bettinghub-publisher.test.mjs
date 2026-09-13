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
      values.set(key, { value: String(value), metadata: options.metadata || null });
    },
    async get(key) {
      return values.get(key)?.value || null;
    },
    async getWithMetadata(key) {
      const stored = values.get(key);
      return stored ? { value: new TextEncoder().encode(stored.value).buffer, metadata: stored.metadata } : { value: null, metadata: null };
    },
  };
}

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
