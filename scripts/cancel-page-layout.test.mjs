import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const cancelHtml = await fs.readFile(new URL('../cancel.html', import.meta.url), 'utf8');
const membershipCss = await fs.readFile(new URL('../membership.css', import.meta.url), 'utf8');

test('manage-membership page uses shared site chrome and a bounded responsive layout', () => {
  assert.match(cancelHtml, /class="site-ticker"/);
  assert.match(cancelHtml, /class="site-header"/);
  assert.match(cancelHtml, /class="manage-copy"/);
  assert.match(cancelHtml, /class="manage-panel"/);
  assert.match(cancelHtml, /membership\.css\?v=20260917-discord-handoff/);
  assert.match(membershipCss, /\.manage-shell\s*\{[^}]*grid-template-columns:/s);
  assert.match(membershipCss, /\.manage-shell\s*\{[^}]*padding:/s);
  assert.match(membershipCss, /@media \(max-width:800px\)[\s\S]*?\.manage-shell\s*\{[^}]*grid-template-columns:1fr/s);
});

test('manage-membership action remains the authenticated Stripe portal flow', () => {
  assert.match(cancelHtml, /data-portal-login/);
  assert.match(cancelHtml, /Open Stripe billing portal/);
  assert.match(cancelHtml, /Discord account connected to your membership/);
  assert.match(cancelHtml, /Canceling stops the next renewal/);
});
