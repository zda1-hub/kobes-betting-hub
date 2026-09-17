import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const css = await readFile(new URL('home.css', root), 'utf8');

test('shared sticky header defaults to flush top and offsets only a real adjacent ticker', () => {
  const finalRules = css.slice(css.indexOf('/* Only reserve a ticker offset'));
  assert.match(finalRules, /\.site-header\s*\{\s*top:0;\s*\}/);
  assert.match(finalRules, /\.site-ticker \+ \.site-header\s*\{\s*top:34px;/);
  assert.match(finalRules, /@media \(max-width:800px\)[\s\S]*\.site-ticker \+ \.site-header\s*\{\s*top:30px;/);
  assert.doesNotMatch(finalRules, /\.site-header\s*\{\s*top:30px;[\s\S]*\.site-header/);
});

test('every public shared-header page uses the same cache-busted stylesheet', async () => {
  const pages = (await readdir(root)).filter(file => file.endsWith('.html'));
  const sharedPages = [];
  for (const page of pages) {
    const html = await readFile(new URL(page, root), 'utf8');
    if (!/href="home\.css/.test(html)) continue;
    sharedPages.push(page);
    assert.match(html, /href="home\.css\?v=20260917-exclusives"/, page);
    const beforeHeader = html.slice(html.indexOf('<body'), html.indexOf('<header'));
    if (/class="site-ticker"/.test(beforeHeader)) {
      assert.match(beforeHeader, /<\/div>\s*$/, page);
    }
  }
  assert.deepEqual(sharedPages.sort(), ['cancel.html', 'exclusives.html', 'free-pick.html', 'index.html', 'join.html', 'membership.html', 'refer.html']);
});
