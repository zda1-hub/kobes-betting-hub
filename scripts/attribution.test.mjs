import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');

function visit({ url, referrer = '', storage = new Map(), now = Date.now() }) {
  const parsed = new URL(url);
  const calls = [];
  const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const context = {
    URL, URLSearchParams, Intl, Date: class extends Date { static now() { return now; } }, console, localStorage,
    crypto: { randomUUID: () => { const count = Number(storage.get('test.uuid.count') || 0) + 1; storage.set('test.uuid.count', String(count)); return `${String(count).padStart(8, '0')}-1234-4123-8123-123456789012`; } },
    location: { hostname: parsed.hostname, pathname: parsed.pathname, search: parsed.search },
    document: { referrer },
    fetch: async (requestUrl, options) => { calls.push({ requestUrl, body: JSON.parse(options.body) }); return { ok: true }; },
    window: { __KBH_MEMBERSHIP_CONFIG__: { workerOrigin: 'https://worker.test' }, KBHConsent: { allowed: () => true } },
  };
  context.window.KBHAnalytics = null;
  vm.runInNewContext(source, context);
  return { attribution: context.window.KBHAnalytics.attribution, storage, event: calls[0]?.body };
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

test('Instagram short UTM and referral hosts are grouped as Instagram', () => {
  assert.equal(visit({ url: 'https://kobesbettinghub.com/?utm_source=ig' }).attribution.first_source, 'instagram');
  assert.equal(visit({ url: 'https://kobesbettinghub.com/', referrer: 'https://l.instagram.com/' }).attribution.first_source, 'instagram');
});

test('short social tags are grouped under their platform names', () => {
  for (const [tag, source] of [['tt', 'tiktok'], ['yt', 'youtube'], ['fb', 'facebook']]) {
    assert.equal(visit({ url: `https://kobesbettinghub.com/?utm_source=${tag}` }).attribution.first_source, source);
  }
});

test('a returning browser starts a new visit after 30 minutes', () => {
  const storage = new Map();
  const first = visit({ url: 'https://kobesbettinghub.com/', storage, now: 100000000 });
  const second = visit({ url: 'https://kobesbettinghub.com/join?utm_source=ig', storage, now: 101800001 });
  assert.notEqual(second.event.session_id, first.event.session_id);
  assert.equal(second.attribution.first_source, 'direct');
  assert.equal(second.attribution.last_source, 'instagram');
});
