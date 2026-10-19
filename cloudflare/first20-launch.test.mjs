import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { default: worker, __test: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = {
  STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_MONTHLY_PRICE_ID: 'price_month',
  SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_SECRET_KEY: 'fixture',
};

 test('retired $5 promotion rejects new requests before Stripe or association creation', async t => {
  let externalCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { externalCalls++; throw new Error('External call must not occur'); });
  assert.equal(api.first20Active(Date.parse('2026-10-19T17:00:00Z')), false);
  const status = await (await worker.fetch(new Request('https://worker.test/promotions/first20'), env)).json();
  assert.deepEqual(status, { state: 'retired', ready: false });
  for (const path of ['/checkout/prepare', '/create-checkout']) {
    const response = await worker.fetch(new Request(`https://worker.test${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: 'first_month_back', deal: 'first20' }),
    }), env);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not open/);
  }
  await assert.rejects(
    api.createAssociatedCheckout(env, {
      id: 'prepared_before_retirement', offer: 'first_month_back',
      attribution: { promotion: 'first20' },
    }, 'public_fixture', 'member_fixture'),
    /has ended/,
  );
  assert.equal(externalCalls, 0);
});
