const test = require('node:test');
const assert = require('node:assert/strict');
const { REFERRAL_CARD_MARKER, referralCardPayload } = require('./referral-card');

const config = {
  login_url: 'https://example.com/referrals/login',
  dashboard_url: 'https://example.com/refer.html'
};

test('builds a simple $10 referral card without copying another server’s commission terms', () => {
  const payload = referralCardPayload(config);
  const text = JSON.stringify(payload);
  assert.match(text, /\$10 cash/);
  assert.match(text, /first \$32\.99 membership payment/);
  assert.match(text, /seven-day review/);
  assert.match(text, /Self-referrals/);
  assert.doesNotMatch(text, /20%|\$25/);
  assert.ok(payload.embeds[0].footer.text.startsWith(REFERRAL_CARD_MARKER));
  assert.deepEqual(payload.components[0].components.map((button) => button.label), ['Get my referral link', 'Check earnings']);
});

test('refuses insecure referral destinations', () => {
  assert.throws(() => referralCardPayload({ ...config, login_url: 'http://example.com' }), /HTTPS/);
});
