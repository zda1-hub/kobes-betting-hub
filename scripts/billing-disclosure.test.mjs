import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

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

test('membership discloses current billing with one duration-selectable card and private referral choices', async () => {
  const source = await readRepositoryFile('membership-scene.js');
  const scene = source.match(/panel\.innerHTML=`([\s\S]*?)`;/)[1];
  const pages = await Promise.all(['index.html', 'join.html', 'membership.html'].map(readRepositoryFile));
  for (const page of pages) assert.match(page, /src="membership-scene\.js/);
  assert.match(source, /arrival\.get\('ref'\)/);
  assert.match(source, /!arrival\.has\('checkout'\).*scene-other'\)\.hidden=true/);
  assert.match(source, /KBH\|KBC/);
  assert.match(source, /A-Z0-9.*10/);
  const longer = vm.runInNewContext('('+source.match(/const longerOffers=(\{[\s\S]*?\n  \});/)[1]+')');
  assert.equal(longer.six_month.price, '$134.99');
  assert.match(longer.six_month.period, /every 6 months/);
  assert.equal(longer.annual.price, '$194.99');
  assert.match(longer.annual.period, /yearly/);
  assert.match(source, /longerCheckout\.dataset\.checkout=offer/);
  assert.match(scene, /data-longer-plan="six_month"/);
  assert.match(scene, /data-longer-plan="annual"/);
  const compositions = pages.map(page => page + scene);
  assert.equal(dataAttributeText(compositions[0], 'data-checkout-message'), dataAttributeText(compositions[1], 'data-checkout-message'));
  for (const html of compositions) {
    const articles = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)];
    const checkoutOffers = articles.filter(([, , content]) => /data-checkout=/.test(content));
    assert.equal(checkoutOffers.length, 3, 'monthly, one longer-term card and the disclosed paid seven-day option');
    const offers = new Map(checkoutOffers.map(([, , content]) => [content.match(/data-checkout="([^"]+)"/)[1], visibleText(content)]));
    assert.deepEqual([...offers.keys()].sort(), ['monthly', 'six_month', 'starter']);
    assert.match(offers.get('monthly'), /Cancel Anytime, No Commitment/);
    assert.match(offers.get('monthly'), /2 days free, then \$32\.99 billed monthly until canceled/);
    assert.match(offers.get('starter'), /\$10 today/);
    assert.match(offers.get('starter'), /First 7 days, then \$32\.99\/month until canceled/);
    assert.match(offers.get('starter'), /No free trial/i);
    assert.match(offers.get('six_month'), /\$134\.99/);
    assert.match(offers.get('six_month'), /Billed every 6 months/);
    assert.match(visibleText(scene), /All plans renew automatically\. Longer plans and the paid starter have no free trial/);
    assert.match(visibleText(scene), /Cancel before the 2-day trial ends to avoid the first monthly charge/);
    const text = visibleText(html);
    assert.match(text, /Cancel before renewal/);
    assert.match(text, /access continues through your paid-through date/);
    assert.match(text, /non-refundable except where required by law, card-network rules or a written Hub exception/);
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
