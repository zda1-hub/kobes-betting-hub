import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./bettinghub-publisher.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = {
  FREE_PICK_X_QUEUE_SECRET: 'dedicated-x-test-key',
  QUEUE_INGEST_SECRET: 'operator-test-key',
  TRENDS_QUEUE_SECRET: 'trends-test-key',
  RECAP_NOTIFICATION_QUEUE_SECRET: 'recap-test-key',
  DAILY_PICKS_QUEUE_SECRET: 'daily-test-key',
  X_CLIENT_ID: 'test-client',
  OAUTH_STATE_SECRET: 'test-state-signing-key',
  DB: { prepare() { return { async all() { return { results: [] }; } }; } },
};
function request(path, key, method = 'GET') {
  return new Request(`https://publisher.test${path}`, {
    method, headers: key ? { authorization: `Bearer ${key}` } : {},
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
}

test('X queue accepts dedicated delivery key and existing operator key', async () => {
  for (const key of [env.FREE_PICK_X_QUEUE_SECRET, env.QUEUE_INGEST_SECRET]) {
    assert.equal((await worker.fetch(request('/api/queue/x', key), env)).status, 200);
    assert.equal((await worker.fetch(request('/api/queue/x', key, 'POST'), env)).status, 400);
  }
  assert.equal((await worker.fetch(request('/api/queue/x', env.FREE_PICK_X_QUEUE_SECRET), {
    ...env, QUEUE_INGEST_SECRET: undefined,
  })).status, 200);
});

test('missing/wrong credentials cannot inspect or submit X posts', async () => {
  const forbiddenDb = { prepare() { throw new Error('Unauthorized database access'); } };
  for (const key of [undefined, 'wrong-key', env.TRENDS_QUEUE_SECRET]) {
    for (const method of ['GET', 'POST']) {
      assert.equal((await worker.fetch(request('/api/queue/x', key, method), { ...env, DB: forbiddenDb })).status, 401);
    }
  }
});

test('dedicated X delivery key cannot access website or email queues', async () => {
  for (const path of ['/api/free-pick/publish', '/api/queue/trends', '/api/queue/recap-notifications', '/api/queue/daily-picks']) {
    assert.equal((await worker.fetch(request(path, env.FREE_PICK_X_QUEUE_SECRET, 'POST'), env)).status, 401, path);
  }
});

test('only the operator credential may initiate X account replacement', async () => {
  for (const key of [undefined, 'wrong-key', env.FREE_PICK_X_QUEUE_SECRET]) {
    assert.equal((await worker.fetch(request('/auth/x/start', key), env)).status, 401);
  }
  const response = await worker.fetch(request('/auth/x/start', env.QUEUE_INGEST_SECRET), env);
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /^https:\/\/x\.com\/i\/oauth2\/authorize\?/);
});

test('daily queue denies unauthorized read, write, and acknowledgement before touching storage', async () => {
  const forbiddenDb = { prepare() { throw new Error('Unauthorized database access'); } };
  for (const key of [undefined, 'wrong-key', env.FREE_PICK_X_QUEUE_SECRET]) {
    for (const [path, method] of [['/api/queue/daily-picks', 'GET'], ['/api/queue/daily-picks', 'POST'], ['/api/queue/daily-picks/deliver', 'POST']]) {
      assert.equal((await worker.fetch(request(path, key, method), { ...env, DB: forbiddenDb })).status, 401);
    }
  }
  assert.equal((await worker.fetch(request('/api/queue/daily-picks', env.DAILY_PICKS_QUEUE_SECRET, 'POST'), env)).status, 400);
});

test('recap readers retain their existing scoped credentials', async () => {
  for (const key of [env.RECAP_NOTIFICATION_QUEUE_SECRET, env.QUEUE_INGEST_SECRET, env.TRENDS_QUEUE_SECRET, 'legacy-x-email-test-key']) {
    assert.equal((await worker.fetch(request('/api/queue/recap-notifications', key, 'POST'), {
      ...env, X_PUBLISHER_QUEUE_SECRET: 'legacy-x-email-test-key',
    })).status, 400);
  }
});
