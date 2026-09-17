import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { manualExclusiveGroups } from './import-manual-exclusives.mjs';

test('every supplied line appears exactly once in its own capper card without added odds or research', async () => {
  const text = await fs.readFile(new URL('../data/manual-exclusives-2026-09-17.txt', import.meta.url), 'utf8');
  const groups = manualExclusiveGroups(text, '2026-09-17', '2026-09-17T22:30:00Z');
  assert.equal(groups.length, 44);
  assert.equal(groups.reduce((sum, group) => sum + group.picks.length, 0), 139);
  assert.deepEqual(groups.filter(group => group.packet.manual_review_required).map(group => group.packet.analysis.extraction.source_capper_name), ['KimsPicks', 'NazEaster']);
  for (const group of groups) {
    assert.equal(group.payload.embeds[0].description, [group.packet.analysis.extraction.source_capper_name, ...group.picks.map(pick => `• ${pick}`)].join('\n'));
    assert.equal(group.packet.approval.decision, null);
    assert.equal(group.payload.components[0].components[0].disabled, true);
    assert.equal(group.packet.analysis.extraction.plays.length, group.picks.length);
  }
  assert.equal(groups.find(group => group.packet.analysis.extraction.source_capper_name === 'DommyLocked').picks.filter(pick => pick.startsWith('Mika Brunold')).length, 2);
  assert.match(groups.find(group => group.packet.analysis.extraction.source_capper_name === 'NazEaster').packet.manual_review_required, /Market is missing/);
});
test('stable content IDs prevent repeated import; edits produce new review IDs', () => {
  const one = manualExclusiveGroups('Capper\nLions +5.5 -110 (1U)', '2026-09-17');
  const two = manualExclusiveGroups('Capper\nLions +5.5 -110 (1U)', '2026-09-17');
  assert.equal(one[0].packet.pick_id, two[0].packet.pick_id);
  assert.notEqual(one[0].packet.pick_id, manualExclusiveGroups('Capper\nLions +5.5 -120 (1U)', '2026-09-17')[0].packet.pick_id);
});
