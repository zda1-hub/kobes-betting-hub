const test = require('node:test');
const assert = require('node:assert/strict');
const { COMMUNITY_REFERRAL_ANNOUNCEMENT_MARKER, communityReferralAnnouncementPayload } = require('./referral-announcement');

test('launch notice explains the real link and payout steps without an immediate-cash claim', () => {
  const payload = communityReferralAnnouncementPayload('https://kobesbettinghub.com/refer.html');
  const embed = payload.embeds[0];
  assert.equal(payload.allowedMentions.parse.length, 0);
  assert.equal(payload.components[0].components[0].url, 'https://kobesbettinghub.com/refer.html');
  assert.match(embed.description, /at least 7 days/);
  assert.match(embed.fields.map((field) => field.value).join(' '), /first \$32\.99 paid month/);
  assert.match(embed.fields.map((field) => field.value).join(' '), /Set up payouts through Stripe/);
  assert.match(embed.footer.text, new RegExp(COMMUNITY_REFERRAL_ANNOUNCEMENT_MARKER));
});
