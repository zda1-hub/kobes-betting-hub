import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');

function visit({ url, referrer = '', storage = new Map() }) {
  const parsed = new URL(url);
  const calls = [];
  const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const context = {
    URL, URLSearchParams, Intl, Date, console, localStorage,
    crypto: { randomUUID: () => '12345678-1234-4123-8123-123456789012' },
    location: { hostname: parsed.hostname, pathname: parsed.pathname, search: parsed.search },
    document: { referrer },
    fetch: async (requestUrl, options) => { calls.push({ requestUrl, body: JSON.parse(options.body) }); return { ok: true }; },
    window: { __KBH_MEMBERSHIP_CONFIG__: { workerOrigin: 'https://worker.test' } },
  };
  context.window.KBHAnalytics = null;
  vm.runInNewContext(source, context);
  return { attribution: context.window.KBHAnalytics.attribution, storage, event: calls[0].body };
}

test('Discord campaign is normalized and retained through an OAuth/Stripe return', () => {
  const first = visit({ url: 'https://kobesbettinghub.com/join?utm_source=DISCORD&utm_medium=community&utm_campaign=vip_push' });
  const returned = visit({ url: 'https://kobesbettinghub.com/welcome?checkout=success', referrer: 'https://checkout.stripe.com/', storage: first.storage });
  assert.equal(returned.attribution.first_source, 'discord');
  assert.equal(returned.attribution.first_campaign, 'vip_push');
  assert.equal(returned.attribution.last_source, 'discord');
});

test('X first touch and Discord last touch are preserved separately', () => {
  const first = visit({ url: 'https://kobesbettinghub.com/free-pick?utm_source=twitter&utm_medium=organic_social&utm_campaign=daily_picks' });
  const last = visit({ url: 'https://kobesbettinghub.com/join?utm_source=discord&utm_medium=community&utm_campaign=vip_push', storage: first.storage });
  assert.equal(last.attribution.first_source, 'x');
  assert.equal(last.attribution.first_campaign, 'daily_picks');
  assert.equal(last.attribution.last_source, 'discord');
  assert.equal(last.attribution.last_campaign, 'vip_push');
});

test('Referral links override generic traffic and retain the referring identifier', () => {
  const result = visit({ url: 'https://kobesbettinghub.com/join?ref=KBH-ABC1234567' });
  assert.equal(result.attribution.first_source, 'referral');
  assert.equal(result.attribution.referral_identifier, 'KBH-ABC1234567');
});

test('An untagged visit without a referrer is legitimate direct traffic', () => {
  const result = visit({ url: 'https://kobesbettinghub.com/' });
  assert.equal(result.attribution.first_source, 'direct');
  assert.equal(result.attribution.last_source, 'direct');
});

for (const [tag, expected] of [['x', 'x'], ['discord', 'discord'], ['instagram', 'instagram'], ['tiktok', 'tiktok'], ['google', 'google'], ['email', 'email'], ['creator_test', 'affiliate']]) {
  test(`${tag} UTM stays attributed across the join and Stripe return pages`, () => {
    const first = visit({ url: `https://kobesbettinghub.com/?utm_source=${tag}&utm_medium=organic&utm_campaign=sprint&utm_content=creative_a` });
    const join = visit({ url: 'https://kobesbettinghub.com/join', storage: first.storage });
    const returned = visit({ url: 'https://kobesbettinghub.com/welcome?checkout=success', referrer: 'https://checkout.stripe.com/', storage: first.storage });
    for (const step of [first, join, returned]) {
      assert.equal(step.attribution.first_source, expected);
      assert.equal(step.attribution.first_campaign, 'sprint');
      assert.equal(step.attribution.first_content, 'creative_a');
      assert.equal(step.attribution.utm_source, tag);
      assert.equal(step.attribution.utm_medium, 'organic');
      assert.equal(step.attribution.utm_campaign, 'sprint');
      assert.equal(step.attribution.utm_content, 'creative_a');
    }
  });
}

test('TikTok referral host and Kobe X tagged link remain distinct sources', () => {
  assert.equal(visit({ url: 'https://kobesbettinghub.com/', referrer: 'https://www.tiktok.com/@creator/video/123' }).attribution.first_source, 'tiktok');
  assert.equal(visit({ url: 'https://kobesbettinghub.com/join?utm_source=kobe_x' }).attribution.first_source, 'kobe_x');
});

test('YouTube and Facebook remain distinct promotional sources', () => {
  assert.equal(visit({ url: 'https://kobesbettinghub.com/join?utm_source=youtube' }).attribution.first_source, 'youtube');
  assert.equal(visit({ url: 'https://kobesbettinghub.com/join?utm_source=facebook' }).attribution.first_source, 'facebook');
});
