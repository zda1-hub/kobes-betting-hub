import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildAppsScriptBundle } from './build-apps-script-bundle.mjs';

test('Apps Script bundle contains one backlog-safe recap handler and the private Trends intake', async () => {
  const output = await buildAppsScriptBundle();
  const source = await readFile(output, 'utf8');
  assert.equal((source.match(/function deliverKobeRecapNotifications\(/g) || []).length, 1);
  assert.equal((source.match(/function installKobeRecapNotifications\(/g) || []).length, 1);
  assert.equal((source.match(/function queueKobeTrendEmails\(/g) || []).length, 1);
  assert.match(source, /RECAP_NOTIFICATION_START_AT/);
  assert.match(source, /TRENDS_EMAIL_START_AT/);
  assert.match(source, /testRecapQueueConnection/);
  assert.match(source, /testTrendsQueueConnection/);
});
