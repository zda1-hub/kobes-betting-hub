import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceUrl = new URL('../cloudflare/kobe-daily-picks-email.gs', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');

function bodyBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, 'missing ' + startMarker);
  assert.notEqual(end, -1, 'missing ' + endMarker);
  return source.slice(start, end);
}

test('daily Apps Script returns before email construction on zero-pick days', () => {
  const body = bodyBetween('function sendDailyApprovedPicks()', 'function sendDailyPackage()');
  const guard = body.indexOf('if (!picks.length) return 0;');
  const subject = body.indexOf('const subject =');
  const send = body.indexOf('MailApp.sendEmail');

  assert.ok(guard >= 0);
  assert.ok(subject > guard);
  assert.ok(send > subject);
});

test('daily teaser returns before any queue request when there are no approved picks', () => {
  const body = bodyBetween('function queueDailyXTeaser()', 'function testXQueueConnection()');
  const guard = body.indexOf("if (!hasApprovedPicksForToday_()) return 'No approved picks today; no X post queued.';");
  const fetch = body.indexOf('UrlFetchApp.fetch');

  assert.ok(guard >= 0);
  assert.ok(fetch > guard);
});

test('Apps Script source stores only property names and no credential values', () => {
  assert.match(source, /getScriptProperties\(\)/);
  assert.doesNotMatch(source, /Bearer\s+(?:sk-|sb_|eyJ|[A-Za-z0-9_-]{32,})/);
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\//);
});

test('recap polling uses its dedicated property and is documented as trigger-disabled', () => {
  assert.match(source, /const RECAP_QUEUE_SECRET_KEY = 'RECAP_NOTIFICATION_QUEUE_SECRET';/);
  assert.match(source, /const RECAP_NOTIFICATION_START_KEY = 'RECAP_NOTIFICATION_START_AT';/);
  assert.match(source, /intentionally not installed as a trigger/);
  assert.match(source, /getProperty\(RECAP_QUEUE_SECRET_KEY\)/);
  assert.match(source, /getProperty\(RECAP_NOTIFICATION_START_KEY\)/);
  assert.match(source, /recap-notifications\?after=/);
});
