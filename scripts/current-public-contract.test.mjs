import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('current public pages retain navigation, legal links and shared stylesheet', async () => {
  for (const page of ['index.html','join.html','membership.html','proof.html','free-pick.html','cancel.html']) {
    const html = await readFile(new URL(page, root), 'utf8');
    assert.match(html, /data-menu-toggle/, page);
    assert.match(html, /href="site\.css(?:\?[^\"]*)?"/, page);
    assert.match(html, /responsible-gambling/, page);
  }
});
test('current proof gallery retains unique images and working viewer controls', async () => {
  const html = await readFile(new URL('proof.html', root), 'utf8');
  const images = [...html.matchAll(/(?:src|data-image)="(assets\/[^\"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(images.filter(file=>file.includes('/reviews/'))).size, 15);
  assert.equal(new Set(images.filter(file=>file.includes('/slips/'))).size, 4);
  assert.doesNotMatch(html, /17-3-recap|8-2-recap|member-slip-example|data-verified-results-track/);
  await Promise.all([...new Set(images)].map(file=>access(new URL(file, root))));
  for (const attribute of ['data-dialog-close','data-dialog-image']) assert.ok(html.includes(attribute));
  assert.match(html, /Recent Wins/);
  assert.doesNotMatch(html, /Full ledger/);
});
