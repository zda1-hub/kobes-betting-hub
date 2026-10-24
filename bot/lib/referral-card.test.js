const test = require('node:test');
const assert = require('node:assert/strict');
const { REFERRAL_CARD_MARKER, referralCardPayload } = require('./referral-card');

const config = {
  login_url: 'https://example.com/referrals/login',
  dashboard_url: 'https://example.com/refer.html'
};

test('builds a simple $20 referral card without copying another server’s commission terms', () => {
  const payload = referralCardPayload(config);
  const text = JSON.stringify(payload);
  assert.match(text, /\$20 cash/);
  assert.match(text, /first \$32\.99 membership payment/);
  assert.match(text, /seven-day review/);
  assert.match(text, /Self-referrals/);
  assert.doesNotMatch(text, /20%|\$25/);
  assert.ok(payload.embeds[0].footer.text.startsWith(REFERRAL_CARD_MARKER));
  assert.deepEqual(payload.components[0].components.map((button) => button.label), ['Get my referral link', 'Check earnings']);
  assert.doesNotMatch(text, /Free server members/);
  assert.equal(payload.components[0].components[0].url, config.login_url);
});

test('free-member card only appears with its separate rollout flag', () => {
  const payload = referralCardPayload({ ...config, community_enabled: true });
  const text = JSON.stringify(payload);
  assert.match(text, /Free server members of 7\+ days/);
  assert.match(text, /manual approval/);
  assert.equal(payload.components[0].components[0].url, config.dashboard_url);
});

test('refuses insecure referral destinations', () => {
  assert.throws(() => referralCardPayload({ ...config, login_url: 'http://example.com' }), /HTTPS/);
});
