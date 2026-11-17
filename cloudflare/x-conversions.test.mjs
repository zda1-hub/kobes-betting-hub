import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('./kobes-checkout-worker.js', import.meta.url), 'utf8');
const { __test: { xConversionsConfigured: configured, conversionPayload, oauthHeader,
  sendXConversion, consentedXClickId } } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const env = {
  X_ADS_CONSUMER_KEY: 'consumer', X_ADS_CONSUMER_SECRET: 'consumer-secret',
  X_ADS_ACCESS_TOKEN: 'access', X_ADS_ACCESS_TOKEN_SECRET: 'access-secret',
};
const trial = { kind: 'trial', conversionId: `trial:${'a'.repeat(64)}`,
  twclid: 'X-click.id_123', occurredAt: '2026-11-16T23:00:00.000Z' };

test('X conversion requires configured Ads API credentials and a consented click ID', async () => {
  assert.equal(consentedXClickId({ attribution: { twclid: trial.twclid } }), '');
  assert.equal(consentedXClickId({ tracking_consent: true, attribution: { twclid: trial.twclid } }), trial.twclid);
  assert.equal(consentedXClickId({ tracking_consent: true, attribution: { twclid: 'bad click id' } }), '');
  assert.equal(configured({ ...env, X_ADS_ACCESS_TOKEN: '' }), false);
  assert.equal(conversionPayload({ ...trial, twclid: '' }), null);
  assert.equal(conversionPayload({ ...trial, twclid: 'bad click id' }), null);
  assert.equal(conversionPayload({ ...trial, conversionId: 'sub_private' }), null);
  let called = false;
  assert.deepEqual(await sendXConversion({}, trial, () => { called = true; }), { status: 'not_configured' });
  assert.equal(called, false);
});

test('trial and paid events use existing X event IDs with one stable pixel dedupe ID', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, status: 200 };
  };
  await sendXConversion(env, trial, fetchImpl);
  await sendXConversion(env, { ...trial, kind: 'purchase',
    conversionId: `purchase:${'b'.repeat(64)}`, value: 3299, currency: 'USD' }, fetchImpl);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, 'https://ads-api.x.com/12/measurement/conversions/rht3t');
  assert.deepEqual(seen.map(row => row.body.conversions[0].event_id), ['rhuz5', 'rhuz6']);
  assert.deepEqual(seen.map(row => row.body.conversions[0].conversion_id),
    [trial.conversionId, `purchase:${'b'.repeat(64)}`]);
  assert.deepEqual(seen[0].body.conversions[0].identifiers, [{ twclid: trial.twclid }]);
  assert.equal(seen[1].body.conversions[0].value, '32.99');
  assert.equal(seen[1].body.conversions[0].currency, 'USD');
  assert.match(seen[0].options.headers.Authorization, /^OAuth /);
  assert.doesNotMatch(JSON.stringify(seen), /consumer-secret|access-secret|email|discord/);
});

test('OAuth header signs a deterministic request without exposing secrets', async () => {
  const header = await oauthHeader(env,
    'https://ads-api.x.com/12/measurement/conversions/rht3t',
    Date.parse('2026-11-16T23:00:00Z'), 'fixednonce');
  assert.match(header, /oauth_consumer_key="consumer"/);
  assert.match(header, /oauth_timestamp="1794870000"/);
  assert.match(header, /oauth_signature="[A-Za-z0-9%]+"/);
  assert.doesNotMatch(header, /secret/);
});

test('HTTP failures are visible to worker logs without leaking the response body', async () => {
  await assert.rejects(sendXConversion(env, trial, async () => ({ ok: false, status: 401 })),
    /HTTP 401/);
});
