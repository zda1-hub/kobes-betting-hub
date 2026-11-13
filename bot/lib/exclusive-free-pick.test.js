const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareExclusiveFreePick, preparedFreePick } = require('./exclusive-free-pick');

const packet = {
  pick_id: '20261113-001-X',
  source: { publish_mode: 'terms_only', text: 'External source wager', media_urls: ['https://source.test/card.png'] },
  approval: { decision: null, image_url: 'https://source.test/card.png' },
  analysis: { status: 'SOURCE_EXTRACTED', extraction: {
    is_pick_candidate: true, sport: 'Basketball', league: 'NBA', event: 'Celtics at Knicks',
    source_capper_name: 'Example Capper',
    plays: [{ selection: 'Jayson Tatum over 5.5 rebounds', player_name: 'Jayson Tatum', line: '5.5 rebounds', odds_american: '-110', source_claims: ['Copied source claim'] }],
    source_claims: ['Copied source claim'],
  } },
};

test('an exclusive needs separate research and a locked Free Pick preview', async () => {
  const prepared = await prepareExclusiveFreePick(packet, { research: async independent => {
    independent.analysis.extraction.supporting_notes = [
      'Over 5.5 rebounds in seven of his last ten games',
      'Averaged eight rebounds over his last five games',
      'Played at least 35 minutes in four straight games',
      'The opponent allowed 47 rebounds per game last season',
      'Had nine rebound chances in the previous game',
      'Recorded seven rebounds in his last matchup',
    ].map((text, index) => ({ text, source_url: `https://www.espn.com/nba/game/_/gameId/${index + 1}` }));
    return { complete: true, packet: independent };
  } });
  assert.equal(prepared.source.publish_mode, 'terms_only');
  assert.equal(prepared.analysis.extraction.source_claims.length, 0);
  assert.equal(prepared.analysis.extraction.plays[0].source_claims.length, 0);
  assert.equal(prepared.approval.image_url, undefined);
  assert.match(prepared.approval.exact_final_copy, /Over 5\.5 rebounds in seven/);
  assert.doesNotMatch(prepared.approval.exact_final_copy, /Copied source claim|https:\/\//);
  assert.equal(preparedFreePick(prepared).source.publish_mode, 'independent_writeup');
  prepared.analysis.extraction.supporting_notes[0].text = 'Changed after approval';
  assert.throws(() => preparedFreePick(prepared), /changed after review/);
});

test('a terms-only exclusive with no independent breakdown stays VIP-only', async () => {
  await assert.rejects(prepareExclusiveFreePick(packet, { research: async independent => ({ complete: false, packet: independent,
    reason: 'ESPN could not resolve the player' }) }), /ESPN could not resolve/);
  assert.equal(packet.approval.free_prepared, undefined);
  assert.throws(() => preparedFreePick(packet), /separately reviewed/);
});
