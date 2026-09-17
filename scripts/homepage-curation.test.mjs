import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('home.css', root), 'utf8');

test('homepage presents short slogan, historical proof, then curation explanation', () => {
  assert.match(html, /Real cappers\.<\/span><span>Real plays\.<\/span><span><em>One Hub\.<\/em>/);
  assert.match(html, /Picks curated from across the betting community, reviewed by Kobe/);
  const hero = html.indexOf('aria-labelledby="hero-title"');
  const proof = html.indexOf('id="proof"');
  const how = html.indexOf('id="how-it-works"');
  assert.ok(hero >= 0 && hero < proof && proof < how);
  assert.doesNotMatch(html, /Opening after final access testing/);
  assert.match(html, /Selected examples—not a complete performance record/);
});

test('homepage retains real gallery files, image viewer, membership and navigation', async () => {
  const paths = [...html.matchAll(/data-image="(assets\/[^"\s]+)"/g)].map(match => match[1]);
  assert.ok(paths.length >= 20);
  await Promise.all(paths.map(path => access(new URL(path, root))));
  assert.match(html, /data-dialog-close/);
  assert.match(html, /data-menu-toggle/);
  assert.match(html, /href="join.html#offer">Try 2 days free/);
  assert.match(html, /href="cancel.html"/);
  assert.match(html, /No outcome is guaranteed/);
});

test('curated headline and process have narrow-screen layouts and anchor offsets', () => {
  assert.match(css, /\.hero-curated h1 span\s*\{\s*display:block/);
  assert.match(css, /\.hero-curated h1\s*\{\s*font-size:clamp\(48px,13\.8vw,86px\)/);
  assert.match(css, /\.how-grid\s*\{\s*grid-template-columns:1fr/);
  assert.match(css, /scroll-margin-top:128px/);
});
