'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configured, cleanText } = require('./member-inbox');

test('member inbox stays off until Kobe and the private channel are identified', () => {
  const base = { DISCORD_GUILD_ID: '1215407647155683358',
    KOBE_USER_ID: '123456789012345678', KOBE_INBOX_CHANNEL_ID: '223456789012345678' };
  assert.equal(configured(base), true);
  assert.equal(configured({ ...base, KOBE_USER_ID: '' }), false);
  assert.equal(configured({ ...base, KOBE_INBOX_CHANNEL_ID: '' }), false);
});

test('member messages cannot trigger mass mentions or exceed relay limit', () => {
  assert.equal(cleanText('hey @everyone and @here'), 'hey [mention] and [mention]');
  assert.equal(cleanText('a'.repeat(3000)).length, 1750);
});
