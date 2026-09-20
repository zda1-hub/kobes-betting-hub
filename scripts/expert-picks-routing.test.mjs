import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('terms-only approvals expose and enforce expert-picks as their sole destination', async () => {
  const [index, collector, telegram, manualImport] = await Promise.all([
    readFile(new URL('bot/index.js', root), 'utf8'),
    readFile(new URL('pipeline/collect-x.js', root), 'utf8'),
    readFile(new URL('bot/lib/telegram-reader.js', root), 'utf8'),
    readFile(new URL('scripts/import-manual-exclusives.mjs', root), 'utf8'),
  ]);
  assert.match(index, /configuredTermsOnly \? expertPicksChannelId/);
  assert.match(collector, /EXPERT_PICKS_CHANNEL_ID \|\| process\.env\.PUBLISH_CHANNEL_ID/);
  for (const source of [collector, telegram, manualImport]) {
    assert.match(source, /#expert-picks/);
    assert.doesNotMatch(source, /Post to #exclusives/);
  }
});
