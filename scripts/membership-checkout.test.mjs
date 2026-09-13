import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../membership.js', import.meta.url), 'utf8');

function checkoutPage(fetchImpl) {
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
    crypto: globalThis.crypto,
    location: { search: '', assign: (url) => assignedUrls.push(url) },
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
    URLSearchParams,
    window,
  });
  return { buttons, storage, assignedUrls };
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
