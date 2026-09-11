const test = require('node:test');
const assert = require('node:assert/strict');
const { footballGamesScheduledToday, footballPriority, isSinglePlayPacket, likelyWriteupOrTrend, nflGamesScheduledToday, shouldQueueForReview, shouldSplitPlayPackets } = require('./collect-x');
const { isSupportedSportPick } = require('../bot/lib/event-timing');

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

test('sends image-only posts from every enabled source to vision extraction', () => {
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: '' }, ['https://example.com/pick.png']), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard', publish_mode: 'terms_only' }, { text: '' }, ['https://example.com/exclusive.png']), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'photo_review' }, { text: '' }, ['https://example.com/card.png']), true);
});

test('sends text-only NFL picks from regular and exclusive sources to extraction', () => {
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: 'NFL Rams -4.5 10u' }, []), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: 'NFL DeMario Douglas 4+ receptions' }, []), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard', publish_mode: 'terms_only' }, { text: 'NFL Matthew Stafford over .5 passing touchdown 4u' }, []), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: 'Patriots practice report and injury news' }, []), false);
});

test('accepts every supported major sport while keeping football explicit', () => {
  for (const [sport, league] of [
    ['Football', 'NFL'],
    ['College Football', 'NCAAF'],
    ['Baseball', 'MLB'],
    ['Basketball', 'NBA'],
    ['Basketball', 'WNBA'],
    ['Hockey', 'NHL'],
    ['Soccer', 'MLS']
  ]) {
    assert.equal(isSupportedSportPick({ analysis: { extraction: { sport, league, event: 'Team A vs Team B' } } }), true, `${sport}/${league}`);
  }
  assert.equal(isSupportedSportPick({ analysis: { extraction: { sport: 'Tennis', league: 'ATP', event: 'Player A vs Player B' } } }), false);
});

test('prioritizes NFL and college-football captions before other sports', () => {
  assert.equal(footballPriority({ text: 'MLB player prop over 1.5 hits' }), 1);
  assert.equal(footballPriority({ text: 'College football player prop over 3.5 receptions' }), 0);
  assert.equal(footballPriority({ text: 'NFL spread -3.5' }), 0);
});

test('preflight detects when the NFL has no games today', async () => {
  const result = await nflGamesScheduledToday({
    now: new Date('2026-09-11T20:09:00.000Z'),
    fetchImpl: async () => ({ ok: true, async json() { return { events: [] }; } })
  });
  assert.equal(result, false);
});

test('preflight allows a college-football slate when the NFL is empty', async () => {
  let calls = 0;
  const result = await footballGamesScheduledToday({
    now: new Date('2026-09-11T20:09:00.000Z'),
    fetchImpl: async () => ({
      ok: true,
      async json() {
        calls += 1;
        return calls === 1 ? { events: [] } : { events: [{ name: 'Ranked college matchup' }] };
      }
    })
  });
  assert.equal(result, true);
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
