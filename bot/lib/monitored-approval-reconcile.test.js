const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { consolidatePendingMonitoredApprovals } = require('./monitored-approval-reconcile');

function packet(number, handle, selection, postId) {
  return {
    pick_id: `20261022-${String(number).padStart(3, '0')}-X`, approval_number: number,
    discord_review_message_id: `message-${number}`, status: 'READY_FOR_APPROVAL', approval_ready: true,
    approval: {}, source: { platform: 'Twitter/X', publish_mode: 'monitored_terms', handle,
      post_id: postId, post_url: `https://x.com/${handle}/status/${postId}` },
    analysis: { status: 'SOURCE_EXTRACTED', extraction: { is_pick_candidate: true,
      plays: [{ selection, odds_american: selection.match(/[-+]\d{2,4}$/)?.[0] || '-110',
        player_name: selection.split(' ').slice(0, 2).join(' '), event: 'Verified upcoming game' }] } },
    verification: { event_start: '2026-10-23T01:30:00.000Z' }
  };
}

test('replaces separate pending cards from one X capper with one actionable approval', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-cappertopics-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const rows = [
    packet(62, 'AlexCaruso', 'Caleb Williams Under 19.5 Rush Yards -113', 'post-a'),
    packet(63, 'AlexCaruso', 'A.J. Brown Over 69.5 receiving yards -114', 'post-b'),
    packet(64, '__LordPenguin', 'Nikola Jokic over 47.5 PRA -120', 'post-c')
  ];
  for (const row of rows) await fs.writeFile(path.join(directory, `${row.pick_id}.json`), JSON.stringify(row));
  const messages = new Map(rows.map(row => [row.discord_review_message_id, {
    edits: [], deleted: false,
    async edit(payload) { this.edits.push(payload); },
    async delete() { this.deleted = true; }
  }]));
  const channel = { messages: { fetch: async id => messages.get(id) } };
  const revisions = [];
  const superseded = [];
  const receipt = await consolidatePendingMonitoredApprovals({ directory, channel,
    paidLabel: 'Post to #expert-picks', recordRevision: async packet => revisions.push(packet.pick_id),
    recordSuperseded: async packet => superseded.push(packet.pick_id) });
  assert.deepEqual(receipt, { groups: 1, retired: 1 });
  const primary = JSON.parse(await fs.readFile(path.join(directory, `${rows[0].pick_id}.json`), 'utf8'));
  const duplicate = JSON.parse(await fs.readFile(path.join(directory, `${rows[1].pick_id}.json`), 'utf8'));
  assert.equal(primary.analysis.extraction.plays.length, 2);
  assert.equal(duplicate.approval.decision, 'GROUPED');
  assert.equal(messages.get('message-63').deleted, true);
  const finalEdit = messages.get('message-62').edits.at(-1);
  assert.equal(finalEdit.embeds[0].description,
    '@AlexCaruso\n• Caleb Williams Under 19.5 Rush Yards -113\n• A.J. Brown Over 69.5 receiving yards -114');
  assert.deepEqual(finalEdit.components[0].components.map(button => button.label), ['Post to #expert-picks', 'Reject']);
  assert.deepEqual(revisions, [rows[0].pick_id]);
  assert.deepEqual(superseded, [rows[1].pick_id]);
  assert.equal(messages.get('message-64').edits.length, 0);
  assert.deepEqual(await consolidatePendingMonitoredApprovals({ directory, channel, paidLabel: 'Post to #expert-picks' }),
    { groups: 0, retired: 0 });
});
