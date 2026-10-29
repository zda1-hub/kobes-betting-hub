const test = require('node:test');
const assert = require('node:assert/strict');
const { revisePublishedWriteup } = require('./published-writeup-edit');
const { writeupDescription } = require('./source-review');

const packet = {
  pick_id: '20261029-001-X',
  source: { publish_mode: 'independent_writeup' },
  analysis: { extraction: {
    player_name: 'Test Player', selection: 'Test Player Over', line: '5.5 assists', odds_american: '-110',
    source_claims: [
      'Test Player recorded 7 assists in the last game',
      'Test Player averaged 6 assists over the last 5 games',
      'The opponent allowed 8 assists to the same position last game',
      'Test Player logged 34 minutes in the last game'
    ]
  } },
  approval: { decision: 'PAID_PUBLISHED' }
};
packet.approval.exact_final_copy = writeupDescription(packet);

test('edits a published writeup in place without changing its wager terms', () => {
  const result = revisePublishedWriteup(packet, packet.approval.exact_final_copy, [
    'Test Player recorded 8 assists in the last game',
    'Test Player averaged 6 assists over the last 5 games',
    'The opponent allowed 8 assists to the same position last game',
    'Test Player logged 34 minutes in the last game'
  ].map((line) => `- ${line}`).join('\n'), 'kobe-id', '2026-10-29T12:00:00Z');
  assert.equal(result.changed, true);
  assert.equal(result.copy.split('\n\n')[0], packet.approval.exact_final_copy.split('\n\n')[0]);
  assert.match(result.copy, /recorded 8 assists/);
  assert.equal(result.packet.approval.writeup_edits[0].by, 'kobe-id');
  assert.equal(packet.approval.writeup_edits, undefined);
  const again = revisePublishedWriteup(result.packet, result.copy, [
    'Test Player recorded 9 assists in the last game',
    'Test Player averaged 6 assists over the last 5 games',
    'The opponent allowed 8 assists to the same position last game',
    'Test Player logged 34 minutes in the last game'
  ].map((line) => `- ${line}`).join('\n'), 'kobe-id', '2026-10-29T13:00:00Z');
  assert.equal(again.packet.approval.writeup_edits.length, 2);
  assert.equal(again.copy.split('\n\n')[0], result.copy.split('\n\n')[0]);
});

test('rejects stale or invalid corrections instead of silently changing published terms', () => {
  assert.throws(() => revisePublishedWriteup(packet, 'different post', 'four\nshort\nlines\nhere', 'kobe-id'), /do not match/);
  assert.throws(() => revisePublishedWriteup(packet, packet.approval.exact_final_copy,
    '- Test Player recorded 8 assists\n- Test Player recorded 8 assists\n- Test Player logged 34 minutes\n- Test Player averaged 6 assists', 'kobe-id'), /duplicated/);
  assert.throws(() => revisePublishedWriteup(packet, packet.approval.exact_final_copy,
    '- Test Player recorded 8 assists\n- https://example.com\n- Test Player logged 34 minutes\n- Test Player averaged 6 assists', 'kobe-id'), /link/);
});
