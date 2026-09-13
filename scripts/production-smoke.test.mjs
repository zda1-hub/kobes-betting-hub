import test from 'node:test';
import assert from 'node:assert/strict';

import { runProductionSmoke, validateCurrentFreePick } from './production-smoke.mjs';

const endpoints = {
  checkoutHealth: 'https://checkout.test/health',
  publisherHealth: 'https://publisher.test/health',
  currentFreePick: 'https://publisher.test/api/free-pick/current',
  publicFreePick: 'https://site.test/free-pick',
};

function response(body, { status = 200, type = 'application/json', url } = {}) {
  const result = new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });
  if (url) Object.defineProperty(result, 'url', { value: url });
  return result;
}

function successfulFetch(requests = []) {
  return async (url, options) => {
    requests.push({ url: String(url), options });
    const target = String(url);
    if (target === endpoints.checkoutHealth) return response({ ok: true });
    if (target === endpoints.publisherHealth) return response({ service: 'bettinghub-publisher', status: 'ready', xConnected: false, freePickReady: true });
    if (target === endpoints.currentFreePick) return response({ publishedDate: '2026-09-12', caption: 'Approved play', details: { selection: 'Player over 10.5' }, imageUrl: null });
    if (target === endpoints.publicFreePick) {
      return response('<i data-free-pick-date></i><i data-free-pick-caption></i><i data-free-pick-status></i><script src="/free-pick.js?v=1"></script>', {
        type: 'text/html; charset=utf-8', url: endpoints.publicFreePick,
      });
    }
    if (target === 'https://site.test/free-pick.js?v=1') return response("fetch(PUBLISHER_URL + '/api/free-pick/current')", { type: 'application/javascript' });
    throw new Error(`unexpected request: ${target}`);
  };
}

test('production smoke passes all public read-only checks using GET requests', async () => {
  const requests = [];
  const report = await runProductionSmoke({ fetchFn: successfulFetch(requests), endpoints, timeoutMs: 100 });

  assert.equal(report.ok, true);
  assert.deepEqual(report.results.map(({ name, ok }) => ({ name, ok })), [
    { name: 'checkout health', ok: true },
    { name: 'publisher health', ok: true },
    { name: 'current Free Pick API', ok: true },
    { name: 'public Free Pick page', ok: true },
    { name: 'Free Pick client asset', ok: true },
  ]);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(({ options }) => options.method === 'GET'));
  assert.ok(requests.every(({ options }) => !('body' in options)));
  assert.ok(requests.every(({ options }) => !('authorization' in Object.fromEntries(Object.entries(options.headers).map(([key, value]) => [key.toLowerCase(), value])))));
});

test('production smoke reports independent failures and returns an unsuccessful report', async () => {
  const fetchFn = successfulFetch();
  const report = await runProductionSmoke({
    fetchFn: async (url, options) => String(url) === endpoints.checkoutHealth
      ? response({ ok: false })
      : fetchFn(url, options),
    endpoints,
    timeoutMs: 100,
  });

  assert.equal(report.ok, false);
  assert.match(report.results.find(({ name }) => name === 'checkout health').error, /ok: true/);
  assert.equal(report.results.find(({ name }) => name === 'publisher health').ok, true);
});

test('production smoke explains when the client asset cannot be checked', async () => {
  const fetchFn = successfulFetch();
  const report = await runProductionSmoke({
    fetchFn: async (url, options) => String(url) === endpoints.publicFreePick
      ? response('<html>no client script</html>', { type: 'text/html', url: endpoints.publicFreePick })
      : fetchFn(url, options),
    endpoints,
    timeoutMs: 100,
  });

  assert.equal(report.ok, false);
  assert.match(report.results.find(({ name }) => name === 'public Free Pick page').error, /missing data-free-pick-date/);
  assert.match(report.results.find(({ name }) => name === 'Free Pick client asset').error, /not checked/);
});

test('text-only Free Pick shape requires a selection or pick', () => {
  assert.throws(() => validateCurrentFreePick({
    publishedDate: '2026-09-12',
    caption: 'Approved play',
    details: {},
    imageUrl: null,
  }), /details\.selection or details\.pick/);
});
