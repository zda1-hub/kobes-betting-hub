import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./bettinghub-publisher.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const worker = workerModule.default;

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
