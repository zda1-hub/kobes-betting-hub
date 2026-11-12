import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_MONTHLY_PRICE_ID: 'price_month' };

test('Discord first-five offer validates the real monthly price and five-use coupon', async t => {
  let uses = 0;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const path = new URL(input).pathname;
    if (path.endsWith('/prices/price_month')) return Response.json({ active: true, currency: 'usd', unit_amount: 3299, recurring: { interval: 'month', interval_count: 1 } });
    if (path.endsWith('/coupons/kbh_discord_first5_20261111')) return Response.json({ id: 'kbh_discord_first5_20261111', amount_off: 2799, currency: 'usd', duration: 'once', max_redemptions: 5, times_redeemed: uses, valid: uses < 5 });
    throw new Error(`Unexpected external call: ${path}`);
  });
  const status = () => worker.fetch(new Request('https://worker.test/promotions/discord-first5'), env).then(r => r.json());
  assert.deepEqual(await status(), { state: 'open', ready: true, firstMonthCents: 500, renewalCents: 3299, limit: 5 });
  uses = 5;
  assert.deepEqual(await status(), { state: 'unavailable', ready: false });
  const direct = await worker.fetch(new Request('https://worker.test/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offer: 'first_month_back', deal: 'discord_first5' }) }), env);
  assert.equal(direct.status, 400);
  assert.match((await direct.json()).error, /Discord account/);
});
