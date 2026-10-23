import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSeoPage } from './check-public-seo.mjs';
const canonical = 'https://kobesbettinghub.com/test';
const good = `<html><head><title>Test guide</title><meta content="A useful description" name="description"><link href="${canonical}" rel="canonical"><script type="application/ld+json">{"@type":"Article"}</script></head><body><h1>Guide</h1></body></html>`;
test('accepts valid indexable metadata with reordered attributes', () => assert.deepEqual(checkSeoPage(good, canonical), []));
test('rejects index exclusions and conflicting canonical signals', () => {
  const errors = checkSeoPage(good.replace('</head>', '<meta name="googlebot" content="noindex"></head>'), canonical + '/other');
  assert.ok(errors.includes('sitemap page is noindex'));
  assert.ok(errors.includes('canonical differs from sitemap URL'));
});
test('rejects duplicated descriptions and malformed structured data', () => {
  const broken = good.replace('</head>', '<meta name="description" content="duplicate"></head>').replace('{"@type":"Article"}', '{broken}');
  const errors = checkSeoPage(broken, canonical);
  assert.ok(errors.includes('needs one nonempty description'));
  assert.ok(errors.includes('invalid structured data JSON'));
});

test('does not mistake inert fallback or script text for an initial HTML heading', () => {
  for (const tag of ['noscript', 'script', 'template', 'style']) {
    const html = good.replace('<h1>Guide</h1>', `<${tag}><h1>Fallback only</h1></${tag}>`);
    assert.ok(checkSeoPage(html, canonical).includes('missing H1 in initial page content'));
  }
});

test('accepts an initial heading with inline formatting', () => {
  assert.deepEqual(checkSeoPage(good.replace('<h1>Guide</h1>', '<h1><span>Guide</span></h1>'), canonical), []);
});
