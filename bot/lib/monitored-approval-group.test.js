const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeMonitoredApprovalPackets, monitoredCapperKey } = require('./monitored-approval-group');
const { buildSourcePickApprovalEmbed } = require('./source-review');

function card(pickId, postId, selection, event, handle = 'PeakyProps') {
  return {
    pick_id: pickId, approval_number: Number(pickId.match(/-(\d+)/)?.[1] || 0),
    approval: {}, status: 'READY_FOR_APPROVAL',
    source: { platform: 'Twitter/X', publish_mode: 'monitored_terms', handle,
      post_id: postId, post_url: `https://x.com/${handle}/status/${postId}` },
    analysis: { status: 'SOURCE_EXTRACTED', extraction: { is_pick_candidate: true, event,
      plays: [{ selection, player_name: selection.split(' ').slice(0, 2).join(' '),
        odds_american: selection.match(/\(([-+]\d+)\)/)?.[1] || '-110' }] } },
    verification: { event_start: '2026-10-23T00:15:00.000Z' }
  };
}

test('groups separate posts by the same capper into one exact approval card', () => {
  const swift = card('20261022-071-01-X', '100', "D'Andre Swift o14.5 Rush Attempts (-110)", 'Patriots at Bears');
  const gordon = card('20261022-072-01-X', '101', 'Aaron Gordon o5.5 Rebounds (-120)', 'Nuggets at Thunder');
  const merged = mergeMonitoredApprovalPackets([gordon, swift]);
  assert.equal(merged.pick_id, swift.pick_id);
  assert.deepEqual(merged.source.post_ids, ['100', '101']);
  assert.deepEqual(merged.analysis.extraction.plays.map(play => play.event), ['Patriots at Bears', 'Nuggets at Thunder']);
  assert.equal(buildSourcePickApprovalEmbed(merged, 'APPROVED PICK').description,
    "@PeakyProps\n• D'Andre Swift o14.5 Rush Attempts (-110)\n• Aaron Gordon o5.5 Rebounds (-120)");
});

test('a later scan adds a new play once and never mixes cappers', () => {
  const first = card('20261022-071-01-X', '100', "D'Andre Swift o14.5 Rush Attempts (-110)", 'Patriots at Bears');
  const second = card('20261022-072-01-X', '101', 'Aaron Gordon o5.5 Rebounds (-120)', 'Nuggets at Thunder');
  const grouped = mergeMonitoredApprovalPackets([first, second]);
  const repeat = card('20261022-073-01-X', '102', 'Aaron Gordon o5.5 Rebounds (-120)', 'Nuggets at Thunder');
  const next = mergeMonitoredApprovalPackets([grouped, repeat]);
  assert.equal(next.analysis.extraction.plays.length, 2);
  assert.deepEqual(next.source.post_ids, ['100', '101', '102']);
  assert.equal(monitoredCapperKey(card('20261022-074-01-X', '104', 'Other Pick (-110)', '', 'OtherCapper')), 'othercapper');
  assert.throws(() => mergeMonitoredApprovalPackets([first, card('20261022-074-01-X', '104', 'Other Pick (-110)', '', 'OtherCapper')]), /one capper/);
  const unpriced = card('20261022-075-01-X', '105', 'Nikola Jokic over 10.5 rebounds', 'Nuggets at Thunder');
  unpriced.analysis.extraction.plays[0].odds_american = '';
  assert.equal(mergeMonitoredApprovalPackets([first, unpriced]).analysis.extraction.plays.length, 2);
  const unclear = card('20261022-076-01-X', '106', 'Other Pick', 'Nuggets at Thunder');
  unclear.analysis.extraction.plays[0].odds_american = '';
  assert.throws(() => mergeMonitoredApprovalPackets([first, unclear]), /explicit betting market/);
});
