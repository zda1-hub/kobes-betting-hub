const test = require('node:test');
const assert = require('node:assert/strict');
const { isolatePlayPacket } = require('./play-evidence');
const { sourceEvidence, writeupDescription, buildSourcePickEmbed, buildSourcePickApprovalEmbed, assertApprovalCopyMatches, independentWriteupPacket } = require('./source-review');
const { fillMissingEvidence, marketForTerms } = require('./espn-pick-research');

const plays = [
  { player_name: 'Josh Allen', selection: 'Josh Allen Over 249.5 Passing Yards', line: '249.5', event: 'Bills at Lions' },
  { player_name: 'Jahmyr Gibbs', selection: 'Jahmyr Gibbs Over 19.5 Rush Attempts', line: '19.5', event: 'Lions at Bills' },
  { player_name: 'DJ Moore', selection: 'DJ Moore Over 60.5 Receiving Yards', line: '60.5', event: 'Bears at Vikings' }
];
function parent(legs = plays) {
  return {
    pick_id: '20260917-123-X', source: { publish_mode: 'writeup_review' }, approval: { exact_final_copy: 'stale copied breakdown', exact_final_copy_sha256: 'stale' },
    analysis: { status: 'SOURCE_EXTRACTED', extraction: {
      is_pick_candidate: true, league: 'NFL', sport: 'Football', plays: structuredClone(legs),
      source_claims: [
        'Over in 2 straight matchups vs Lions',
        'Lions have had one of the worst pass defenses in the NFL',
        'Bills likely look to throw the ball early and often',
        'Gibbs is the only running back getting carries for the Lions',
        'DJ Moore averaged 65 receiving yards per game'
      ],
      supporting_notes: [{ text: 'Josh Allen averaged 270 passing yards per game' }]
    } }
  };
}

test('isolates the exact Josh Allen/Gibbs/DJ Moore production contamination', () => {
  const packet = parent();
  const gibbs = isolatePlayPacket(packet, plays[1]);
  const moore = isolatePlayPacket(packet, plays[2]);
  assert.deepEqual(gibbs.analysis.extraction.source_claims, ['Gibbs is the only running back getting carries for the Lions']);
  assert.deepEqual(moore.analysis.extraction.source_claims, ['DJ Moore averaged 65 receiving yards per game']);
  assert.deepEqual(gibbs.analysis.extraction.supporting_notes, []);
  assert.deepEqual(moore.analysis.extraction.supporting_notes, []);
  assert.equal(gibbs.approval.exact_final_copy, undefined);
  assert.equal(packet.approval.exact_final_copy, 'stale copied breakdown');
});

test('keeps attributed source facts first but refuses repeated unanchored sibling prose', () => {
  const legs = structuredClone(plays);
  legs[0].source_claims = ['Bills likely look to throw early and often'];
  legs[1].source_claims = ['Bills likely look to throw early and often', 'Had 29 carries in the first matchup', 'DJ Moore averaged 65 receiving yards'];
  const packet = isolatePlayPacket(parent(legs), legs[1]);
  assert.deepEqual(packet.analysis.extraction.source_claims, ['Had 29 carries in the first matchup']);
});

test('legacy split cards cannot authorize their inherited locked breakdown', () => {
  const packet = parent([plays[2]]);
  packet.pick_id = '20260917-123-03-X';
  assert.deepEqual(sourceEvidence(packet), ['DJ Moore averaged 65 receiving yards per game']);
  assert.throws(() => assertApprovalCopyMatches(packet));
});

test('ESPN fills only missing evidence for the isolated athlete and exact market', async () => {
  assert.deepEqual(marketForTerms(plays[1].selection).names, ['rushingAttempts']);
  for (const [index, stat, values] of [[1, 'rushingAttempts', [29, 20, 15, 21]], [2, 'receivingYards', [70, 61, 45, 82]]]) {
    const leg = plays[index];
    const packet = isolatePlayPacket(parent(), leg);
    let calls = 0;
    const result = await fillMissingEvidence(packet, {
      timing: { status: 'UPCOMING', athlete: { id: `athlete-${index}`, fullName: leg.player_name } },
      fetchImpl: async url => {
        calls += 1;
        assert.ok(url.includes(`athlete-${index}`));
        return new Response(JSON.stringify({ names: [stat], events: {}, seasonTypes: [{ displayName: '2025 Regular Season', categories: [{ events: values.map((value, i) => ({ eventId: String(i), stats: [String(value)] })) }] }] }), { status: 200 });
      }
    });
    assert.equal(result.complete, true);
    assert.equal(calls, 1);
    assert.equal(sourceEvidence(packet).length, 4);
    assert.ok(packet.analysis.extraction.supporting_notes.every(note => note.text.includes(leg.player_name)));
    const presentation = independentWriteupPacket(packet);
    assert.equal(buildSourcePickEmbed(presentation, 'FREE PICK').description, buildSourcePickApprovalEmbed(presentation, 'FREE PICK').description);
    assert.ok(!writeupDescription(packet).includes('Josh Allen'));
  }
});

test('a complete per-play source writeup makes no research call', async () => {
  const leg = { ...plays[2], source_claims: ['Averaged 65 receiving yards per game', 'Cleared the line in 12 of 17 games', 'Recorded 93 catches on 137 targets', 'Had at least 61 yards in 7 of the last 10 games'] };
  const packet = isolatePlayPacket(parent([leg]), leg);
  const result = await fillMissingEvidence(packet, { fetchImpl: async () => { throw new Error('unexpected research'); } });
  assert.equal(result.complete, true);
  assert.equal(result.espnCalls, 0);
});
