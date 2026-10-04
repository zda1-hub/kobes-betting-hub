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

test('join and membership clearly disclose four current offers and keep referral choices private', async () => {
  const pages = await Promise.all(['join.html', 'membership.html'].map(readRepositoryFile));
  assert.equal(dataAttributeText(pages[0], 'data-checkout-message'), dataAttributeText(pages[1], 'data-checkout-message'));
  for (const html of pages) {
    const articles = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)];
    const visibleOffers = articles.filter(([, attributes, content]) => !/\bhidden\b/.test(attributes) && /data-checkout=/.test(content));
    assert.equal(visibleOffers.length, 4);
    const offers = new Map(visibleOffers.map(([, , content]) => [content.match(/data-checkout="([^"]+)"/)[1], visibleText(content)]));
    assert.deepEqual([...offers.keys()].sort(), ['annual', 'first_month_back', 'six_month', 'starter']);
    assert.match(offers.get('first_month_back'), /\$19\.99 today/);
    assert.match(offers.get('first_month_back'), /One full month, then \$32\.99\/month until canceled/);
    assert.match(offers.get('first_month_back'), /10\/22\/2026 \(MST\)/);
    assert.match(offers.get('first_month_back'), /No free trial/i);
    assert.match(offers.get('starter'), /\$10 today/);
    assert.match(offers.get('starter'), /First 7 days, then \$32\.99\/month until canceled/);
    assert.match(offers.get('starter'), /No free trial/i);
    assert.match(offers.get('six_month'), /\$134\.99 today/);
    assert.match(offers.get('six_month'), /Then \$134\.99 \/ 6 months until canceled/);
    assert.match(offers.get('annual'), /\$194\.99 today/);
    assert.match(offers.get('annual'), /Then \$194\.99\/year until canceled/);
    assert.match(offers.get('six_month'), /Save \$62\.95 vs\. six \$32\.99 monthly payments/);
    assert.match(offers.get('annual'), /Save \$200\.89 vs\. twelve \$32\.99 monthly payments/);
    for (const offer of ['six_month', 'annual']) assert.match(offers.get(offer), /No trial/);
    const referral = articles.find(([, attributes]) => /data-referral-card/.test(attributes));
    assert.ok(referral); assert.match(referral[1], /\bhidden\b/);
    assert.match(referral[2], /data-referral-button/);
    assert.doesNotMatch(visibleOffers.map(([, , content]) => visibleText(content)).join(' '), /2 days free|two.day trial/i);
    const text = visibleText(html);
    assert.match(text, /Cancel before the next renewal/);
    assert.match(text, /access continues through the paid-through date/);
    assert.match(text, /non-refundable except where required by law, card-network rules, or a written Hub exception/);
    assert.match(html, /href="cancel\.html"/);
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
