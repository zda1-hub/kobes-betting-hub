import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production recap wiring keeps the button gate, private-channel preflight and optional-email independence', async () => {
  const source = await readFile(new URL('../bot/index.js', import.meta.url), 'utf8');
  assert.match(source, /recapApprovals\.decide\(\{ customId: interaction\.customId/);
  assert.match(source, /vip\?\.allow\.has\(PermissionFlagsBits\.ViewChannel\)/);
  assert.match(source, /await queueDiscordRecapApprovals\(date, rows\);/);
  assert.match(source, /if \(!recapEmailConfigured\(\)\) return;/);
  const command = source.slice(source.indexOf('    if (isRecap) {'), source.indexOf('    const pickOptions = optionsFrom(interaction);'));
  assert.match(command, /await recapApprovals\.prepare\(groups\)/);
  assert.doesNotMatch(command, /channel\.send|destinationFor\(/);
  assert.match(source, /recapApprovals\.stop\(\)/);
});
