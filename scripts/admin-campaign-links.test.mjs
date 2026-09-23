import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('admin dashboard includes a platform campaign link builder', async () => {
  const [html, js] = await Promise.all([
    readFile(new URL('admin-analytics.html', root), 'utf8'),
    readFile(new URL('admin-analytics.js', root), 'utf8'),
  ]);
  assert.match(html, /data-link-source/);
  assert.match(html, /data-link-campaign/);
  assert.match(html, /data-copy-tracking-link/);
  assert.match(js, /utm_source/);
  assert.match(js, /utm_medium/);
  assert.match(js, /utm_campaign/);
  assert.match(js, /utm_content/);
  assert.match(js, /navigator\.clipboard\.writeText/);
});
