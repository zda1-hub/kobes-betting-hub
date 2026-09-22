import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../first-month-promo.js', import.meta.url), 'utf8');

function renderAt(now, search = '') {
  const defaults = [{ hidden: false }, { hidden: false }];
  const retained = { hidden: false };
  const promos = [{ hidden: true }, { hidden: true }];
  const message = { textContent: '' };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, {
    Date: Clock, URLSearchParams, window: { location: { search } },
    document: {
      querySelectorAll(selector) {
        return selector === '[data-promo-default]:not([data-promo-retain])' ? defaults : selector === '[data-promo-only]' ? promos : [];
      },
      querySelector(selector) { return selector === '[data-checkout-message]' ? message : null; },
    },
  });
  return { defaults, retained, promos, message };
}

test('the $19.99 first month is visible only during the 30-day Arizona offer window', () => {
  for (const [at, expected] of [
    ['2026-09-22T06:59:59Z', false], ['2026-09-22T07:00:00Z', true],
    ['2026-10-22T06:59:59Z', true], ['2026-10-22T07:00:00Z', false],
  ]) {
    const view = renderAt(Date.parse(at));
    assert.ok(view.defaults.every(element => element.hidden === expected));
    assert.equal(view.retained.hidden, false);
    assert.ok(view.promos.every(element => element.hidden !== expected));
    if (expected) assert.match(view.message.textContent, /\$19\.99 today.*\$10 today for the first 7 days.*\$32\.99 per month/);
  }
});

test('referral and completed checkout pages keep their existing membership messages', () => {
  for (const search of ['?ref=KBC-EA1532FF19', '?checkout=success&session_id=cs_test_example']) {
    const view = renderAt(Date.parse('2026-09-23T12:00:00Z'), search);
    assert.ok(view.defaults.every(element => !element.hidden));
    assert.ok(view.promos.every(element => element.hidden));
    assert.equal(view.message.textContent, '');
  }
});
