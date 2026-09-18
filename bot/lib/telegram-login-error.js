// Never print provider messages: they may contain phone numbers or credentials.
function telegramLoginError(error) {
  const code = String(error?.errorMessage || '').toUpperCase();
  const messages = {
    PHONE_NUMBER_INVALID: 'Telegram rejected the phone format. Enter + followed by the country code and number, without spaces.',
    PHONE_NUMBER_BANNED: 'Telegram reports this number is banned. Contact Telegram support; do not retry automatically.',
    API_ID_INVALID: 'Telegram rejected the application credentials. The cloud API configuration needs checking.',
    PHONE_CODE_INVALID: 'Telegram rejected the login code. Enter the latest code directly in this terminal.',
    PHONE_CODE_EXPIRED: 'The Telegram login code expired. Start a fresh authorization before entering another code.',
    SESSION_PASSWORD_NEEDED: 'Telegram requires your existing two-factor password. Enter it only in the hidden terminal prompt.',
    PASSWORD_HASH_INVALID: 'Telegram rejected the two-factor password. Check it directly in Telegram.',
    AUTH_RESTART: 'Telegram requires a fresh authorization. Stop this attempt and start a new one.'
  };
  if (messages[code]) return { message: messages[code], stop: ['PHONE_NUMBER_BANNED', 'API_ID_INVALID', 'PHONE_CODE_EXPIRED', 'AUTH_RESTART'].includes(code) };
  if (/^FLOOD(?:_PREMIUM)?_WAIT_\d+$/.test(code) || ['FloodWaitError', 'FloodPremiumWaitError'].includes(error?.name)) {
    return { message: 'Telegram has rate-limited login attempts. Stop now and wait before trying again.', stop: true };
  }
  return { message: 'Telegram authorization failed with an unclassified error. Stop and inspect the configuration; no private input was logged.', stop: true };
}

module.exports = { telegramLoginError };
