import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const analytics = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');
const consent = await readFile(new URL('../consent.js', import.meta.url), 'utf8');

test('declined visitor sends no first-party analytics and later consent starts once', () => {
  const listeners = new Map(), calls = [];
  let allowed = false;
  const window = { KBHConsent: { allowed: () => allowed }, addEventListener: (name, fn) => listeners.set(name, fn) };
  const context = { window, location: { hostname: 'kobesbettinghub.com', pathname: '/join', search: '' }, document: { referrer: '' },
    URL, URLSearchParams, Date, Intl, console, crypto: { randomUUID: () => '12345678-1234-4123-8123-123456789012' },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return Promise.resolve({ ok: true }); },
  };
  vm.runInNewContext(analytics, context);
  assert.equal(calls.length, 0);
  allowed = true;
  listeners.get('kbh:consent-change')({ detail: { allowed: true } });
  assert.equal(calls.length, 1);
  listeners.get('kbh:consent-change')({ detail: { allowed: true } });
  assert.equal(calls.length, 1);
});

test('withdrawal clears first-party analytics identifiers', () => {
  const storage = new Map([['kbh.analytics.session', 'session'], ['kbh.analytics.first_touch', '{}']]);
  const listeners = new Map();
  const window = { dispatchEvent: () => {} };
  const context = { window, location: { pathname: '/join' }, document: { addEventListener: (name, fn) => listeners.set(name, fn), querySelector: () => null },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    CustomEvent: class { constructor(name, options) { this.name = name; this.detail = options.detail; } },
  };
  vm.runInNewContext(consent, context);
  window.KBHConsent.update('declined');
  assert.equal(window.KBHConsent.allowed(), false);
  assert.equal(storage.has('kbh.analytics.session'), false);
  assert.equal(storage.has('kbh.analytics.first_touch'), false);
});
