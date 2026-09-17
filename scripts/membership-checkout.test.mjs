import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../membership.js', import.meta.url), 'utf8');

const productionConfig = {
  environment: 'production',
  workerOrigin: 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev',
};

function checkoutPage(fetchImpl, { config = productionConfig, search = '' } = {}) {
  const storage = new Map();
  const assignedUrls = [];
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
  const document = {
    getElementById: () => ({ textContent: '' }),
    querySelector(selector) {
      if (selector === '[data-menu-toggle]') return menuToggle;
      if (selector === '[data-menu]') return menu;
      if (selector === '[data-checkout-message]') return checkoutMessage;
      if (selector === '[data-discord-connect]') return null;
      return null;
    },
    querySelectorAll: (selector) => selector === '[data-checkout]' ? buttons : [],
    addEventListener() {},
  };
  const window = {
    addEventListener() {},
    __KBH_MEMBERSHIP_CONFIG__: config,
    crypto: globalThis.crypto,
    location: { search, assign: (url) => assignedUrls.push(url) },
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
    window,
  });
  return { buttons, storage, assignedUrls, checkoutMessage };
}

test('checkout retries reuse an in-flight request ID and clear it after Stripe returns a URL', async () => {
  const requestIds = [];
  let attempt = 0;
  const page = checkoutPage(async (_url, options) => {
    requestIds.push(options.headers['X-Checkout-Request-Id']);
    attempt += 1;
    if (attempt === 1) throw new TypeError('network interrupted');
    return Response.json({ url: `https://checkout.stripe.test/session-${attempt}` });
  });

  await page.buttons[0].click();
  assert.equal(page.storage.size, 1);
  await page.buttons[0].click();
  assert.equal(requestIds[1], requestIds[0]);
  assert.equal(page.storage.size, 0);
  assert.deepEqual(page.assignedUrls, ['https://checkout.stripe.test/session-2']);

  await page.buttons[0].click();
  assert.notEqual(requestIds[2], requestIds[1]);
});

test('staging checkout only calls the configured staging Worker', async () => {
  const requests = [];
  const page = checkoutPage(async (url) => {
    requests.push(url);
    return Response.json({ url: 'https://checkout.stripe.test/staging-session' });
  }, {
    config: {
      environment: 'staging',
      workerOrigin: 'https://kobes-betting-hub-checkout-staging.example.workers.dev',
    },
  });

  await page.buttons[0].click();
  assert.deepEqual(requests, ['https://kobes-betting-hub-checkout-staging.example.workers.dev/create-checkout']);
});

test('staging checkout fails closed when configured with the production Worker', async () => {
  let fetchCalls = 0;
  const page = checkoutPage(async () => {
    fetchCalls += 1;
    return Response.json({ url: 'https://checkout.stripe.test/should-not-open' });
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
