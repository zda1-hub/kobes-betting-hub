import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const home = await readFile(new URL('index.html', root), 'utf8');
const join = await readFile(new URL('join.html', root), 'utf8');
const css = await readFile(new URL('home.css', root), 'utf8');
const benefits = html => html.match(/<ul class="vip-benefits">([\s\S]*?)<\/ul>/)?.[1].replace(/\s+/g, ' ').trim();

test('home and purchase page share the same six truthful membership benefits', () => {
  assert.ok(benefits(home));
  assert.equal(benefits(home), benefits(join));
  assert.equal((benefits(join).match(/<li>/g) || []).length, 6);
  for (const html of [home, join]) {
    assert.match(html, /VIP access includes/);
    assert.match(html, /Exclusive picks/);
    assert.match(html, /after checkout and connecting your Discord account/);
    assert.doesNotMatch(benefits(html), /500\+|Every play|guaranteed profit|Instant Access/i);
  }
});

test('reference design does not change intro offers or recurring prices', () => {
  assert.match(join, /data-checkout="starter" data-promo-default>Start for \$10 \/ 7 days/);
  assert.match(join, /data-checkout="trial_2_day" data-promo-default>Try 2 days free/);
  assert.match(join, /data-checkout="first_month_back" data-promo-only hidden>Get your first month for \$19\.99/);
  assert.match(join, /Each automatically renews at \$32\.99\/month/);
  assert.doesNotMatch(join, /\$9\.99|\$109\.99|\$199\.99/);
});

test('benefits use a narrow-screen layout without changing shared sticky header offsets', () => {
  assert.match(css, /\.vip-benefits \{ grid-template-columns:1fr; gap:24px;/);
  assert.match(css, /\.vip-benefits li \{ grid-template-columns:26px minmax\(0,1fr\)/);
  assert.match(css, /\.site-header \{ top:0; \}/);
  assert.match(css, /\.site-ticker \+ \.site-header \{ top:30px; \}/);
});
