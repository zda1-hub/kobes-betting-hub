import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { useCanonicalPageLinks } from './prepare-public-site.mjs';

const site = 'https://kobesbettinghub.com';
const sitemap = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');

const pages = new Map([
  ['/', 'index.html'],
  ['/join', 'join.html'],
  ['/exclusives', 'exclusives.html'],
  ['/free-pick', 'free-pick.html'],
  ['/recaps', 'recaps.html'],
  ['/results', 'results.html'],
  ['/proof', 'proof.html'],
  ['/approach', 'approach.html'],
  ['/refer', 'refer.html'],
  ['/faq', 'faq.html'],
  ['/guides', 'guides/index.html'],
  ['/guides/how-to-choose-a-sports-betting-discord', 'guides/how-to-choose-a-sports-betting-discord.html'],
  ['/guides/sports-betting-arbitrage-explained', 'guides/sports-betting-arbitrage-explained.html'],
  ['/guides/how-to-read-betting-odds-and-line-movement', 'guides/how-to-read-betting-odds-and-line-movement.html'],
  ['/guides/bankroll-management-for-sports-betting', 'guides/bankroll-management-for-sports-betting.html'],
  ['/guides/what-a-sports-betting-writeup-should-include', 'guides/what-a-sports-betting-writeup-should-include.html'],
  ['/support', 'support.html']
]);

test('sitemap contains only final public URLs with matching canonicals', async () => {
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, [...pages.keys()].map((route) => `${site}${route}`));
  for (const [route, file] of pages) {
    const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="${site}${route}"`), `${file} canonical URL`);
    assert.doesNotMatch(html, /<meta[^>]+name=["']robots["'][^>]+noindex/i);
  }
});

test('public links use final URLs and keep fragments', () => {
  assert.equal(
    useCanonicalPageLinks('<a href="../join.html#offer">Join</a><a href="../guides/index.html">Guides</a>', 'guides/index.html'),
    '<a href="/join#offer">Join</a><a href="/guides">Guides</a>'
  );
  assert.equal(useCanonicalPageLinks('<a href="cancel.html">Manage</a>', 'index.html'), '<a href="/managemembership">Manage</a>');
  assert.equal(useCanonicalPageLinks('<a href="https://other.example/join.html">External</a>', 'index.html'), '<a href="https://other.example/join.html">External</a>');
});
