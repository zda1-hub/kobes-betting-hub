import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readRepositoryFile(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function dataAttributeText(html, attribute) {
  const match = html.match(new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\b${attribute}\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'));
  assert.ok(match, `expected an element with ${attribute}`);
  return visibleText(match[2]);
}

test('join and membership routes use one complete recurring-billing disclosure', async () => {
  const [join, membership] = await Promise.all([
    readRepositoryFile('join.html'),
    readRepositoryFile('membership.html'),
  ]);
  const joinDisclosure = dataAttributeText(join, 'data-checkout-message');
  const membershipDisclosure = dataAttributeText(membership, 'data-checkout-message');

  assert.equal(membershipDisclosure, joinDisclosure, 'checkout disclosures must not drift between routes');
  assert.match(joinDisclosure, /\$10 today for 7 days/i);
  assert.match(joinDisclosure, /2 days free/i);
  assert.match(joinDisclosure, /automatically renews at \$32\.99\/month/i);
  assert.match(joinDisclosure, /until canceled/i);
  assert.match(joinDisclosure, /cancel before the next renewal/i);
  assert.match(joinDisclosure, /access continues through the paid-through date/i);
  assert.match(joinDisclosure, /non-refundable except where required by law, card-network rules, or a written Hub exception/i);

  const checkoutOffers = (html) => [...html.matchAll(/data-checkout=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(checkoutOffers(join), ['annual', 'six_month', 'starter', 'trial_2_day']);
  assert.deepEqual(checkoutOffers(membership), checkoutOffers(join));
  for (const html of [join, membership]) {
    const text = visibleText(html);
    assert.match(text, /\$134\.99 today, then every 6 months until canceled\. No trial\./);
    assert.match(text, /\$194\.99 today, then every year until canceled\. No trial\./);
    assert.match(text, /Nearly 2 months free/);
    assert.match(text, /Over 6 months free/);
    assert.match(text, /excluding introductory offers/);
    assert.match(html, /class="member-referral"/);
    assert.match(html, /href="refer\.html">Member referral program/);
    assert.match(html, /href="cancel\.html">Already a member\? Manage membership/);
    assert.ok(text.includes(`Save $${(3299 * 6 / 100 - 134.99).toFixed(2)}`));
    assert.ok(text.includes(`Save $${(3299 * 12 / 100 - 194.99).toFixed(2)}`));
  }
});

test('management and help routes preserve cancellation and mandatory refund exceptions', async () => {
  for (const relativePath of ['cancel.html', 'support.html', 'faq.html']) {
    const text = visibleText(await readRepositoryFile(relativePath));
    assert.match(text, /cancel(?:ing|lation) (?:stops|prevents) (?:the )?(?:next|future) renewal/i, `${relativePath} must explain cancellation timing`);
    assert.match(text, /access continues through/i, `${relativePath} must explain access through the paid period`);
    assert.match(text, /paid-through|paid period/i, `${relativePath} must identify the paid-through period`);
    assert.match(text, /non-refundable except where required by (?:applicable )?law/i, `${relativePath} must retain mandatory legal exceptions`);
    assert.match(text, /card-network rules/i, `${relativePath} must retain card-network exceptions`);
    assert.match(text, /written(?: Hub)? exception/i, `${relativePath} must retain written owner exceptions`);
  }
});

test('public legal pages identify the approved operator and are effective', async () => {
  for (const relativePath of ['terms.html', 'privacy.html']) {
    const html = await readRepositoryFile(relativePath);
    const text = visibleText(html);
    assert.doesNotMatch(text, /draft|not yet effective|business review required/i, `${relativePath} must not ship as a draft`);
    assert.match(text, /effective september 13, 2026/i);
    assert.match(text, /Kobe Irwin/);
    assert.match(text, /Kobe's Betting Hub/);
    assert.match(text, /California/i);
    assert.match(text, /support@kobesbettinghub\.com/i);
    assert.doesNotMatch(html, /name=["']robots["'][^>]*noindex/i, `${relativePath} must be publicly indexable`);
  }
});

test('scheduled production health workflow is read-only and credential-free', async () => {
  const workflow = await readRepositoryFile('.github/workflows/production-health.yml');

  assert.match(workflow, /\bschedule:/);
  assert.match(workflow, /\bworkflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /node scripts\/production-smoke\.mjs/);
  assert.doesNotMatch(workflow, /\bsecrets\s*\./i);
  assert.doesNotMatch(workflow, /^\s*[\w-]+:\s*write\s*$/im);
  assert.doesNotMatch(workflow, /\b(push|pull_request_target|deployment|environment):/);
});
