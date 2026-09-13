const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evidenceFromGamelog,
  fillMissingEvidence,
  gameRows,
  marketForTerms,
  thresholdForTerms
} = require('./espn-pick-research');

const gamelog = {
  names: ['receptions', 'receivingTargets', 'receivingYards'],
  events: {
    e1: { gameDate: '2025-12-10T00:00:00Z' },
    e2: { gameDate: '2025-12-03T00:00:00Z' },
    e3: { gameDate: '2025-11-26T00:00:00Z' },
    e4: { gameDate: '2025-11-19T00:00:00Z' }
  },
  seasonTypes: [{
    displayName: '2025 Regular Season',
    categories: [{
      displayName: 'Regular Season Stats',
      events: [
        { eventId: 'e1', stats: ['5', '8', '82'] },
        { eventId: 'e2', stats: ['4', '7', '61'] },
        { eventId: 'e3', stats: ['3', '5', '44'] },
        { eventId: 'e4', stats: ['7', '9', '90'] }
      ]
    }]
  }]
};

function packet(sourceClaims = []) {
  return {
    pick_id: 'TEST-1',
    source: { text: 'NFL', publish_mode: 'writeup_review' },
    analysis: {
      status: 'SOURCE_EXTRACTED',
      extraction: {
        is_pick_candidate: true,
        sport: 'Football',
        league: 'NFL',
        event: 'Dallas Cowboys at New York Giants',
        selection: 'George Pickens over 59.5 receiving yards',
        player_name: 'George Pickens',
        line: '59.5',
        odds_american: '-115',
        source_claims: sourceClaims,
        supporting_notes: [],
        plays: [{
          selection: 'George Pickens over 59.5 receiving yards',
          player_name: 'George Pickens',
          line: '59.5',
          odds_american: '-115',
          event: 'Dallas Cowboys at New York Giants'
        }]
      }
    },
    approval: {}
  };
}

test('maps a player-prop market and threshold without guessing', () => {
  assert.deepEqual(marketForTerms('George Pickens over 59.5 receiving yards').names, ['receivingYards']);
  assert.deepEqual(thresholdForTerms('George Pickens over 59.5 receiving yards'), { direction: 'over', line: 59.5 });
  assert.equal(marketForTerms('Cowboys moneyline'), null);
  assert.equal(thresholdForTerms('George Pickens receiving yards'), null);
});

test('creates four deterministic ESPN facts in the locked writeup style', () => {
  const facts = evidenceFromGamelog({
    gamelog,
    playerName: 'George Pickens',
    terms: 'George Pickens over 59.5 receiving yards',
    sourceUrl: 'https://site.web.api.espn.com/example'
  });
  assert.equal(facts.length, 4);
  assert.match(facts[0].text, /69\.3 receiving yards per game in 2025 regular season/);
  assert.match(facts[1].text, /3 of 4 games \(75%\)/);
  assert.match(facts[3].text, /median of 71\.5/);
  assert.ok(facts.every((fact) => fact.origin === 'espn' && fact.source_url.includes('espn.com')));
  assert.deepEqual(gameRows(gamelog, marketForTerms('receiving yards')).map((row) => row.value), [82, 61, 44, 90]);
});

test('does not call ESPN when the original post already supplies four usable facts', async () => {
  const result = await fillMissingEvidence(packet([
    'Averaged 84 receiving yards per game last season',
    'Cleared this line in 12 of 17 games',
    'Recorded 93 catches on 137 targets',
    'Had at least 60 yards in 7 of the last 10 games'
  ]), {
    fetchImpl: async () => { throw new Error('ESPN must not be called'); }
  });
  assert.equal(result.complete, true);
  assert.equal(result.added, 0);
  assert.equal(result.espnCalls, 0);
});

test('keeps original-post evidence first and fills only the missing slots from ESPN', async () => {
  const draft = packet(['Averaged 84 receiving yards per game last season']);
  const response = new Response(JSON.stringify(gamelog), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await fillMissingEvidence(draft, {
    timing: {
      status: 'UPCOMING',
      athlete: { id: '4426354', fullName: 'George Pickens' },
      playStatuses: [{ athlete: { id: '4426354', fullName: 'George Pickens' } }]
    },
    fetchImpl: async () => response
  });
  assert.equal(result.complete, true);
  assert.equal(result.added, 3);
  assert.equal(draft.analysis.extraction.source_claims[0], 'Averaged 84 receiving yards per game last season');
  assert.equal(draft.analysis.extraction.supporting_notes.length, 3);
});
