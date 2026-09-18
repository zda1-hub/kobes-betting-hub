const test = require('node:test');
const assert = require('node:assert/strict');
const { telegramLoginError } = require('./telegram-login-error');

test('explains known Telegram login failures without logging provider content', () => {
  for (const code of ['PHONE_NUMBER_INVALID', 'API_ID_INVALID', 'PHONE_CODE_INVALID', 'PHONE_CODE_EXPIRED', 'PASSWORD_HASH_INVALID']) {
    const value = telegramLoginError({ errorMessage: code, message: 'private phone code password session' });
    assert.ok(value.message.length > 30);
    assert.equal(value.message.includes('private phone code password session'), false);
  }
  assert.equal(telegramLoginError({ errorMessage: 'PHONE_NUMBER_INVALID' }).stop, false);
  assert.equal(telegramLoginError({ errorMessage: 'API_ID_INVALID' }).stop, true);
});

test('stops rate limits and unknown errors without leaking arbitrary provider data', () => {
  for (const error of [{ errorMessage: 'FLOOD_WAIT_120' }, { name: 'FloodWaitError' }, { errorMessage: '+15555555555', message: 'secret' }, null]) {
    const value = telegramLoginError(error);
    assert.equal(value.stop, true);
    assert.equal(value.message.includes('+15555555555'), false);
    assert.equal(value.message.includes('secret'), false);
  }
});
