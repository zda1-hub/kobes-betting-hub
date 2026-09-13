import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../cancel.js', import.meta.url), 'utf8');
const productionOrigin = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';

function portalPage(config) {
  const attributes = new Map();
  const portalLogin = {
    href: '',
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const message = { textContent: '' };
  const document = {
    getElementById: () => ({ textContent: '' }),
    querySelector(selector) {
      if (selector === '[data-portal-login]') return portalLogin;
      if (selector === '[data-message]') return message;
      return null;
    },
    addEventListener() {},
  };
  const window = {
    __KBH_MEMBERSHIP_CONFIG__: config,
    location: { search: '' },
  };

  vm.runInNewContext(source, { document, URL, URLSearchParams, window });
  return { attributes, message, portalLogin };
}

test('billing portal uses the configured staging Worker origin', () => {
  const page = portalPage({
    environment: 'staging',
    workerOrigin: 'https://kobes-betting-hub-checkout-staging.example.workers.dev',
  });
  assert.equal(
    page.portalLogin.href,
    'https://kobes-betting-hub-checkout-staging.example.workers.dev/discord/login?intent=portal',
  );
});

test('billing portal preserves the production Worker origin', () => {
  const page = portalPage({ environment: 'production', workerOrigin: productionOrigin });
  assert.equal(
    page.portalLogin.href,
    `${productionOrigin}/discord/login?intent=portal`,
  );
});

test('billing portal fails closed when staging points at production', () => {
  const page = portalPage({ environment: 'staging', workerOrigin: productionOrigin });
  assert.equal(page.portalLogin.href, '');
  assert.equal(page.attributes.get('aria-disabled'), 'true');
  assert.match(page.message.textContent, /not configured for a valid membership environment/i);
});
