import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('all independent cloud services start before historical approval research', async () => {
  const source = await readFile(new URL('../bot/index.js', import.meta.url), 'utf8');
  const ready = source.slice(source.indexOf('client.once(Events.ClientReady'), source.indexOf('async function registerCommandsOnStart'));
  const refresh = ready.indexOf('await refreshPendingResearchApprovals()');
  assert.ok(refresh > 0);
  for (const service of ['startInjuryReports', 'startTelegramReader', 'startXMonitor', 'startTrendsSchedule', 'startTrendInbox', 'startFreeRecapSchedule', 'startFreePickDelivery']) {
    assert.ok(ready.indexOf(`${service}();`) > 0 && ready.indexOf(`${service}();`) < refresh, service);
  }
});
