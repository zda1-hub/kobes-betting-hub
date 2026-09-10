const test = require('node:test');
const assert = require('node:assert/strict');
const { isSinglePlayPacket, likelyWriteupOrTrend, shouldSplitPlayPackets } = require('./collect-x');

test('requires exactly one visible play for each approval card', () => {
  const base = { analysis: { extraction: { plays: [{ selection: 'Player A over 5.5 strikeouts', line: '5.5', odds_american: '-115' }] } } };
  assert.equal(isSinglePlayPacket(base), true);
  assert.equal(isSinglePlayPacket({
    analysis: { extraction: { plays: [
      { selection: 'Player A over 5.5 strikeouts', line: '5.5', odds_american: '-115' },
      { selection: 'Player B over 1.5 hits', line: '1.5', odds_american: '+100' }
    ] } }
  }), false);
});

test('recognizes a graphic prop ladder from a writeup-or-trend source', () => {
  assert.equal(likelyWriteupOrTrend('DeMario Douglas Receptions Ladder', ['https://example.com/card.png']), true);
});

test('sends image-only write-up posts to vision extraction', () => {
  assert.equal(likelyWriteupOrTrend('', ['https://example.com/lebron-card.png']), true);
});

test('keeps multi-play exclusives grouped while splitting regular posts', () => {
  const packet = {
    source: { publish_mode: 'terms_only' },
    analysis: { extraction: { plays: [{ selection: 'Bet A' }, { selection: 'Bet B' }] } }
  };
  assert.equal(shouldSplitPlayPackets(packet), false);
  assert.equal(shouldSplitPlayPackets({
    ...packet,
    source: { publish_mode: 'writeup_review' }
  }), true);
});
