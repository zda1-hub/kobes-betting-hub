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
  const connectionPanel = { hidden: true };
  const connectionTitle = { textContent: '' };
  const connectionMessage = { textContent: '' };
  const discordConnect = { hidden: true, href: '', setAttribute() {} };
  const salesSection = { hidden: false };
  const document = {
    getElementById: () => ({ textContent: '' }),
    querySelector(selector) {
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
  return { tracking, buttons, storage, assignedUrls, checkoutMessage, connectionPanel, connectionTitle, connectionMessage, discordConnect, salesSection };
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
