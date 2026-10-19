import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../membership.js', import.meta.url), 'utf8');

const productionConfig = {
  environment: 'production',
  workerOrigin: 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev',
};

function checkoutPage(fetchImpl, { config = productionConfig, search = '', historyState = null } = {}) {
  const storage = new Map();
  const assignedUrls = [];
  const tracking = [];
  const buttons = ['starter', 'trial_2_day'].map((offer) => ({
    dataset: { checkout: offer },
    disabled: false,
    innerHTML: offer,
    textContent: offer,
    addEventListener(type, listener) { if (type === 'click') this.click = listener; },
  }));
  const menu = {
    classList: { toggle: () => false, remove() {} },
    querySelectorAll: () => [],
  };
  const menuToggle = { addEventListener() {}, setAttribute() {} };
  const checkoutMessage = { textContent: '' };
  const promotionTerms = { textContent: '' }, promotionRenewal = { textContent: '' }, timers = [];
  const connectionPanel = { hidden: true };
  const connectionTitle = { textContent: '' };
  const connectionMessage = { textContent: '' };
  const discordConnect = { hidden: true, href: '', setAttribute() {} };
  const salesSection = { hidden: false };
  const document = {
    getElementById: () => ({ textContent: '' }),
    querySelector(selector) {
      if (selector === '[data-primary-membership-checkout]') return buttons[0];
      if (selector === '[data-primary-membership-terms]') return promotionTerms;
      if (selector === '.scene-renewal-note') return promotionRenewal;
      if (selector === '[data-menu-toggle]') return menuToggle;
      if (selector === '[data-menu]') return menu;
      if (selector === '[data-checkout-message]') return checkoutMessage;
      if (selector === '[data-discord-connect]') return discordConnect;
      if (selector === '[data-membership-confirmation]') return connectionPanel;
      if (selector === '[data-connection-title]') return connectionTitle;
      if (selector === '[data-connection-message]') return connectionMessage;
      return null;
    },
    querySelectorAll: (selector) => selector === '[data-checkout]' ? buttons : selector === '[data-membership-sales]' ? [salesSection] : [],
    addEventListener() {},
  };
  const window = {
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    addEventListener() {},
    __KBH_MEMBERSHIP_CONFIG__: config,
    crypto: globalThis.crypto,
    history: { state: historyState, replaceState(state) { this.state = state; } },
    KBHMeta: { trackCheckout: (...args) => tracking.push(args) },
    location: { href: `https://kobesbettinghub.com/join${search}`, search, assign: (url) => assignedUrls.push(url) },
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  vm.runInNewContext(source, {
    console,
    document,
    fetch: fetchImpl,
    URL,
    URLSearchParams,
    Event,
    window,
  });
  return { tracking, buttons, storage, assignedUrls, checkoutMessage, connectionPanel, connectionTitle, connectionMessage, discordConnect, salesSection, promotionTerms, promotionRenewal, timers };
}

test('paid checkout handoff exposes Discord first and prevents a second purchase', async () => {
  let purchases = 0;
  const page = checkoutPage(async () => { purchases++; }, { search: '?checkout=success&session_id=cs_live_example123' });
  assert.equal(page.connectionPanel.hidden, false);
  assert.equal(page.salesSection.hidden, true);
  assert.equal(page.discordConnect.hidden, false);
  assert.equal(page.discordConnect.href, `${productionConfig.workerOrigin}/discord/connect?session_id=cs_live_example123`);
  assert.match(page.connectionMessage.textContent, /Stripe verifies your membership/);
  for (const button of page.buttons) {
    assert.equal(button.disabled, true);
    await button.click();
  }
  assert.equal(purchases, 0);
});

test('incomplete or malformed private connection links fail closed without encouraging repayment', () => {
  for (const session of ['', 'untrusted', 'cs_live_bad%26value']) {
    const page = checkoutPage(() => { throw new Error('must not purchase'); }, { search: `?checkout=success&session_id=${session}` });
    assert.equal(page.connectionPanel.hidden, false);
    assert.equal(page.salesSection.hidden, true);
    assert.equal(page.discordConnect.hidden, true);
    assert.equal(page.discordConnect.href, '');
    assert.match(page.connectionMessage.textContent, /Do not purchase again/);
  }
});

test('invalid environment cannot expose a Discord connection link', () => {
  const page = checkoutPage(() => {}, { config: null, search: '?checkout=success&session_id=cs_live_example123' });
  assert.equal(page.discordConnect.hidden, true);
  assert.match(page.connectionMessage.textContent, /incomplete/);
});

test('connected customers see confirmation instead of purchase buttons', async () => {
  let purchases = 0;
  const page = checkoutPage(async () => { purchases++; }, { search: '?checkout=connected' });
  assert.equal(page.connectionPanel.hidden, false);
  assert.equal(page.salesSection.hidden, true);
  assert.match(page.connectionTitle.textContent, /Discord connected/);
  assert.match(page.connectionMessage.textContent, /do not pay again/);
  await page.buttons[0].click();
  assert.equal(purchases, 0);
});

test('new customers retain the ordinary membership offers', () => {
  const page = checkoutPage(() => {});
  assert.equal(page.connectionPanel.hidden, true);
  assert.equal(page.salesSection.hidden, false);
  assert.equal(page.discordConnect.hidden, true);
  assert.ok(page.buttons.every(button => !button.disabled));
});

test('checkout retries reuse an in-flight request ID and clear it after Stripe returns a URL', async () => {
  const requestIds = [];
  let attempt = 0;
  const page = checkoutPage(async (_url, options) => {
    requestIds.push(options.headers['X-Checkout-Request-Id']);
    attempt += 1;
    if (attempt === 1) throw new TypeError('network interrupted');
    return Response.json({ url: `https://checkout.stripe.com/session-${attempt}` });
  });

  await page.buttons[0].click();
  assert.equal(page.storage.size, 1);
  await page.buttons[0].click();
  assert.equal(requestIds[1], requestIds[0]);
  assert.equal(page.storage.size, 0);
  assert.deepEqual(page.assignedUrls, ['https://checkout.stripe.com/session-2']);

  await page.buttons[0].click();
  assert.notEqual(requestIds[2], requestIds[1]);
});

test('staging checkout only calls the configured staging Worker', async () => {
  const requests = [];
  const page = checkoutPage(async (url) => {
    requests.push(url);
    return Response.json({ url: 'https://checkout.stripe.com/staging-session' });
  }, {
    config: {
      environment: 'staging',
      workerOrigin: 'https://kobes-betting-hub-checkout-staging.example.workers.dev',
    },
  });

  await page.buttons[0].click();
  assert.deepEqual(requests, ['https://kobes-betting-hub-checkout-staging.example.workers.dev/checkout/prepare']);
});

test('staging checkout fails closed when configured with the production Worker', async () => {
  let fetchCalls = 0;
  const page = checkoutPage(async () => {
    fetchCalls += 1;
    return Response.json({ url: 'https://checkout.stripe.com/should-not-open' });
  }, {
    config: {
      environment: 'staging',
      workerOrigin: productionConfig.workerOrigin,
    },
  });

  await page.buttons[0].click();
  assert.equal(fetchCalls, 0);
  assert.match(page.checkoutMessage.textContent, /not configured for a valid membership environment/i);
});

test('checkout tracking fires only after preparation succeeds and its redirect is valid', async () => {
  for (const response of [Response.json({ error: 'unavailable' }, { status: 503 }), Response.json({ url: 'https://evil.example/private' })]) {
    const page = checkoutPage(async () => response);
    await page.buttons[0].click(); assert.equal(page.tracking.length, 0); assert.equal(page.assignedUrls.length, 0);
  }
  const page = checkoutPage(async () => Response.json({ url: 'https://discord.com/oauth2/authorize?state=private' }));
  await page.buttons[0].click(); assert.equal(page.tracking.length, 1); assert.equal(page.tracking[0][0], 'starter');
});
test('legacy paid return still exposes Discord connection after sanitized URL reload', () => {
  const page = checkoutPage(() => {}, { search: '?checkout=success', historyState: { kbhCheckoutSession: 'cs_live_example123' } });
  assert.equal(page.discordConnect.hidden, false);
  assert.match(page.discordConnect.href, /session_id=cs_live_example123$/);
});

test('dedicated $5 link switches only its primary offer and submits the real promotion key', async () => {
  const requests = [];
  const page = checkoutPage(async (url, options) => {
    if (url.endsWith('/promotions/first20')) return Response.json({ state: 'open', ready: true });
    requests.push(JSON.parse(options.body));
    return Response.json({ url: 'https://discord.com/oauth2/authorize' });
  }, { search: '?deal=first20' });
  await new Promise(setImmediate);
  assert.equal(page.buttons[0].textContent, 'Start for $5 →');
  assert.equal(page.buttons[0].disabled, false);
  assert.match(page.promotionTerms.textContent, /\$5.*\$32.99\/month.*No free trial/);
  assert.match(page.promotionRenewal.textContent, /October 22 at 10:00 AM MST/);
  await page.buttons[0].click();
  assert.equal(requests[0].offer, 'first_month_back');
  assert.equal(requests[0].deal, 'first20');
  assert.equal(page.assignedUrls[0], 'https://discord.com/oauth2/authorize');
});
test('scheduled $5 link cannot start early and refreshes to open without a page reload', async () => {
  let state = 'scheduled';
  const page = checkoutPage(async () => Response.json({ state, ready: true }), { search: '?deal=first20' });
  await new Promise(setImmediate);
  assert.equal(page.buttons[0].disabled, true);
  assert.match(page.checkoutMessage.textContent, /opens October 15/);
  state = 'open';
  await page.timers[0]();
  assert.equal(page.buttons[0].disabled, false);
});
test('filled/ended $5 link clearly falls back to the regular trial without sending a discount', async () => {
  const requests = [];
  const page = checkoutPage(async (url, options) => {
    if (url.endsWith('/promotions/first20')) return Response.json({ state: 'sold_out', ready: false });
    requests.push(JSON.parse(options.body));
    return Response.json({ url: 'https://discord.com/oauth2/authorize' });
  }, { search: '?deal=first20' });
  await new Promise(setImmediate);
  assert.equal(page.buttons[0].dataset.checkout, 'monthly');
  assert.equal(page.buttons[0].dataset.deal, undefined);
  assert.match(page.promotionTerms.textContent, /2 days free/);
  assert.match(page.checkoutMessage.textContent, /no longer available/);
  await page.buttons[0].click();
  assert.equal(requests[0].offer, 'monthly');
  assert.equal(requests[0].deal, undefined);
});
test('unavailable status and referral stacking fail closed on the $5 link', async () => {
  const page = checkoutPage(async () => { throw new Error('network unavailable'); }, { search: '?deal=first20' });
  await new Promise(setImmediate);
  assert.equal(page.buttons[0].disabled, true);
  assert.match(page.checkoutMessage.textContent, /temporarily unavailable/);
  let requests = 0;
  const referral = checkoutPage(async () => { requests++; }, { search: '?deal=first20&ref=KBH-ABCDEF1234' });
  assert.equal(referral.buttons[0].disabled, true);
  assert.equal(requests, 0);
  assert.match(referral.checkoutMessage.textContent, /cannot be combined/);
});
