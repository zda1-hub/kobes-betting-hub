import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const worker = workerModule.default;

test('checkout worker health endpoint responds without credentials', async () => {
  const response = await worker.fetch(new Request('https://worker.test/health'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('legacy checkout-session cancellation endpoints are disabled', async () => {
  const response = await worker.fetch(new Request('https://worker.test/cancel/offer?session_id=cs_test_leaked'), {});
  assert.equal(response.status, 410);
  assert.match((await response.json()).error, /Stripe Customer Portal/);
});

test('billing portal fails closed until Discord and Supabase are configured', async () => {
  const response = await worker.fetch(new Request('https://worker.test/discord/login?intent=portal'), {});
  assert.equal(response.status, 503);
  assert.match(await response.text(), /being configured/);
});

test('oversized Stripe webhooks are rejected before buffering', async () => {
  const response = await worker.fetch(new Request('https://worker.test/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Length': '1000001' },
    body: '{}'
  }), {});
  assert.equal(response.status, 413);
});

test('checkout worker exposes a scheduled membership reconciliation handler', () => {
  assert.equal(typeof worker.scheduled, 'function');
});
