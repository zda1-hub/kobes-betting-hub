const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPickEmbed, makeEvidence, validatePick } = require('./pick');

const basePick = {
  pick: 'Test Player OVER 6.5 Strikeouts (-115)',
  evidence: 'Cleared in 4 of 5 starts\n29% strikeout rate\nOpponent ranks bottom 10 in K avoidance\nPitch count has cleared 90',
  confidence: 7.5,
  imageUrl: 'https://example.com/player.gif',
  sourceUrl: 'https://example.com/research'
};

test('formats four verified evidence items', () => {
  assert.match(makeEvidence(basePick.evidence), /^• Cleared in 4 of 5 starts/m);
  assert.match(buildPickEmbed({ ...basePick, pickNumber: 1, sport: 'baseball' }).title, /^#1 • BASEBALL/m);
});

test('rejects unsupported evidence counts', () => {
  assert.throws(() => makeEvidence('one\ntwo\nthree'), /4–8 evidence/);
});

test('accepts semicolon-separated evidence from Discord command fields', () => {
  assert.match(makeEvidence('one; two; three; four'), /^• one/m);
  assert.match(makeEvidence('one; two; three; four'), /• four$/m);
});

test('rejects guarantee language and invalid media URLs', () => {
  assert.throws(() => validatePick({ ...basePick, pick: 'Guaranteed winner' }), /guarantee-style/);
  assert.throws(() => validatePick({ ...basePick, imageUrl: 'not a url' }), /Attach an approved/);
});
