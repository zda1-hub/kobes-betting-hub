const test = require('node:test');
const assert = require('node:assert/strict');
const { VIP_TRIAL_NOTICE_MARKER, vipTrialNoticePayload } = require('./vip-trial-announcement');

test('VIP trial notice sends the existing join route with complete renewal terms', () => {
  const payload = vipTrialNoticePayload();
  const embed = payload.embeds[0];
  assert.match(embed.description, /2 days free, then \$32\.99\/mo until canceled\. Card required\./);
  assert.match(embed.description, /Cancel before the trial ends to avoid the first charge/);
  assert.match(embed.description, /21\+ where permitted/);
  assert.equal(embed.footer.text, VIP_TRIAL_NOTICE_MARKER);
  assert.equal(payload.components[0].components[0].url, 'https://kobesbettinghub.com/join');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});
