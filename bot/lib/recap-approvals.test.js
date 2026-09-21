const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRecapApprovals, recapApprovalGroups, reviewButtons } = require('./recap-approvals');

const config = { enabled: true, guild_id: 'guild', review_channel_id: 'review', destination_channel_id: 'wins',
  source_channel_ids: ['222'], reviewer_user_ids: ['kobe'] };
const row = { pick_id: 'manual-20260917-aaaaaaaaaaaaaaaaaaaa-W001', parent_pick_id: 'manual-20260917-aaaaaaaaaaaaaaaaaaaa',
  wager_scope: 'individual', operating_date: '2026-09-17', status: 'GRADED', published_at: '2026-09-17T18:00:00Z',
  post_reference: 'https://discord.com/channels/111/222/333', source_name: 'Codycoverspreads', selection: 'Reds ML -110 (1U)',
  result: 'W', result_verified_source: 'https://www.espn.com/game/1' };
const groupsFor = rows => recapApprovalGroups({ date: row.operating_date, rows, sourceChannelIds: config.source_channel_ids });

test('separates writeup and exclusive recap button identities', () => {
  const writeup = reviewButtons({ workflowId: 'writeup', approveLabel: 'Post to writeup recaps',
    key: 'a'.repeat(20), digest: 'b'.repeat(20), pending: 0 })[0].components[0];
  const exclusive = reviewButtons({ workflowId: 'exclusive', approveLabel: 'Post to exclusive wins',
    key: 'a'.repeat(20), digest: 'b'.repeat(20), pending: 0 })[0].components[0];
  assert.equal(writeup.label, 'Post to writeup recaps');
  assert.match(writeup.custom_id, /^recap-review:writeup:approve:/);
  assert.match(exclusive.custom_id, /^recap-review:exclusive:approve:/);
});

async function fixture(rows = [row]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-recap-approval-'));
  let current = groupsFor(rows), nextId = 0;
  const channels = {};
  for (const id of ['review', 'wins']) {
    const records = new Map();
    channels[id] = { client: { user: { id: 'bot' } }, records, sends: 0, fail: null,
      messages: { fetch: async argument => {
        if (typeof argument === 'object') return records;
        if (!records.has(argument)) throw new Error('Message missing');
        return records.get(argument);
      } },
      send: async payload => {
        channels[id].sends++;
        if (channels[id].fail === 'permission') throw Object.assign(new Error('Forbidden'), { status: 403 });
        const message = { id: `message-${++nextId}`, author: { id: 'bot' }, embeds: payload.embeds,
          payload, edit: async body => { message.embeds = body.embeds; message.payload = body; return message; } };
        records.set(message.id, message);
        if (channels[id].fail === 'timeout') { channels[id].fail = null; throw new Error('Timeout'); }
        return message;
      } };
  }
  const events = [];
  const create = () => createRecapApprovals({ root, config, channelFor: async id => channels[id],
    loadGroups: async () => current, audit: async (state, status) => events.push({ status, actor: state.actorId }) });
  const request = (group = current[0], action = 'approve') => ({
    customId: `recap-review:${action}:${group.key}:${group.digest}`, userId: 'kobe', guildId: 'guild', channelId: 'review',
    messageId: [...channels.review.records.values()].find(message => message.payload.components?.length)?.id
  });
  return { root, channels, create, events, request, groups: () => current, update: rows => { current = groupsFor(rows); } };
}

test('capper cards preserve every wager, original terms and exact source channel; pending cannot claim a win', () => {
  const groups = groupsFor([row, { ...row, pick_id: 'loss', selection: 'Bills -3.5 -115', result: 'L' },
    { ...row, pick_id: 'unverified', selection: 'Blues ML', result_verified_source: '' },
    { ...row, pick_id: 'another', source_name: 'OtherCapper' },
    { ...row, pick_id: 'draft', published_at: '' }, { ...row, pick_id: 'free', post_reference: 'https://discord.com/channels/111/444/555' }]);
  assert.equal(groups.length, 2);
  assert.match(groups[0].body, /Codycoverspreads 1-1💸 \(1 pending\)/);
  assert.match(groups[0].body, /Reds ML -110 \(1U\) ☘️/);
  assert.match(groups[0].body, /Bills -3.5 -115 💥/);
  assert.equal(groups[0].pending, 1);
  assert.equal(groups[0].total, 3);
  assert.throws(() => recapApprovalGroups({ date: '../secret', rows: [], sourceChannelIds: [] }), /date/);
});

test('private preparation never publishes; only Kobe’s exact-card approval sends, with double-click/restart deduplication', async () => {
  const f = await fixture(), engine = f.create();
  const receipts = await engine.prepare(f.groups());
  assert.equal(receipts.length, 1);
  assert.equal(f.channels.wins.sends, 0);
  const control = [...f.channels.review.records.values()].at(-1).payload.components[0].components;
  assert.equal(control[0].label, 'Post to exclusive wins');
  assert.equal(control[1].label, 'Edit note');
  assert.equal(control[2].label, 'Reject');
  await assert.rejects(engine.decide({ ...f.request(), userId: 'not-kobe' }), /Only Kobe/);
  await assert.rejects(engine.decide({ ...f.request(), guildId: 'other' }), /Only Kobe/);
  await assert.rejects(engine.decide({ ...f.request(), channelId: 'other' }), /Only Kobe/);
  await assert.rejects(engine.decide({ ...f.request(), messageId: 'forged' }), /stale/);
  const results = await Promise.all([engine.decide(f.request()), engine.decide(f.request())]);
  assert.deepEqual(results.map(r => r.status), ['PUBLISHED', 'ALREADY_PUBLISHED']);
  assert.equal(f.channels.wins.sends, 1);
  assert.equal(f.events.find(e => e.status === 'PUBLISHING').actor, 'kobe');
  assert.equal((await f.create().decide(f.request())).status, 'ALREADY_PUBLISHED');
  assert.equal(f.channels.wins.sends, 1);
  await f.create().prepare(f.groups());
  assert.equal(f.channels.review.sends, 1);
});

test('Kobe can revise a recap note without changing locked wagers or verified results', async () => {
  const f = await fixture(), engine = f.create();
  await engine.prepare(f.groups());
  const card = [...f.channels.review.records.values()].at(-1);
  const editId = card.payload.components[0].components[1].custom_id;
  const draft = await engine.beginEdit({ customId: editId, userId: 'kobe', guildId: 'guild', channelId: 'review', messageId: card.id });
  await assert.rejects(engine.beginEdit({ customId: editId, userId: 'other', guildId: 'guild', channelId: 'review', messageId: card.id }), /Only Kobe/);
  await engine.editNote({ key: draft.key, digest: draft.digest, note: 'Correction: this recap includes the late game.',
    userId: 'kobe', guildId: 'guild', channelId: 'review' });
  assert.match(card.embeds[0].description, /Reds ML -110 \(1U\) ☘️/);
  assert.match(card.embeds[0].description, /Correction: this recap includes the late game/);
  await assert.rejects(engine.decide(f.request()), /stale/);
  const updated = card.payload.components[0].components[0].custom_id;
  assert.equal((await engine.decide({ customId: updated, userId: 'kobe', guildId: 'guild', channelId: 'review', messageId: card.id })).status, 'PUBLISHED');
  assert.match([...f.channels.wins.records.values()][0].embeds[0].description, /Correction: this recap includes the late game/);
});

test('reject is durable, disables buttons, and never sends to wins', async () => {
  const f = await fixture(), engine = f.create();
  await engine.prepare(f.groups());
  assert.equal((await engine.decide(f.request(undefined, 'reject'))).status, 'REJECTED');
  assert.equal((await f.create().decide(f.request())).status, 'REJECTED');
  assert.equal(f.channels.wins.sends, 0);
  assert.ok([...f.channels.review.records.values()].at(-1).payload.components[0].components.every(button => button.disabled));
});

test('pending results disable approve and server rejects a forged click; fresh grades replace the card in place', async () => {
  const f = await fixture([{ ...row, result: 'PENDING' }]), engine = f.create();
  await engine.prepare(f.groups());
  const stale = f.request();
  assert.equal([...f.channels.review.records.values()].at(-1).payload.components[0].components[0].disabled, true);
  await assert.rejects(engine.decide(stale), /Unverified/);
  f.update([row]);
  await assert.rejects(engine.decide(stale), /changed/);
  await engine.prepare(f.groups());
  await assert.rejects(engine.decide(stale), /stale/);
  assert.equal(f.channels.review.sends, 1);
  assert.equal((await engine.decide(f.request())).status, 'PUBLISHED');
});

test('a lost public send response is reconciled on explicit owner retry, never blindly re-sent', async () => {
  const f = await fixture(), engine = f.create();
  await engine.prepare(f.groups());
  f.channels.wins.fail = 'timeout';
  await assert.rejects(engine.decide(f.request()), /Timeout/);
  assert.equal(f.channels.wins.sends, 1);
  assert.equal((await f.create().decide(f.request())).status, 'PUBLISHED');
  assert.equal(f.channels.wins.sends, 1);
});

test('an uncertain public send without matching history remains held across restart', async () => {
  const f = await fixture(), engine = f.create();
  await engine.prepare(f.groups());
  f.channels.wins.fail = 'timeout';
  await assert.rejects(engine.decide(f.request()), /Timeout/);
  f.channels.wins.records.clear();
  await assert.rejects(f.create().decide(f.request()), /reconciliation/);
  assert.equal(f.channels.wins.sends, 1);
});

test('lost private response recovers its receipt without duplicating the approval card', async () => {
  const f = await fixture(), engine = f.create();
  f.channels.review.fail = 'timeout';
  await assert.rejects(engine.prepare(f.groups()), /Timeout/);
  await f.create().prepare(f.groups());
  assert.equal(f.channels.review.sends, 1);
  assert.equal(f.channels.wins.sends, 0);
});

test('certain public permission failure can retry only after owner approval; no scheduler public send', async () => {
  const f = await fixture(), engine = f.create();
  await engine.prepare(f.groups());
  f.channels.wins.fail = 'permission';
  await assert.rejects(engine.decide(f.request()), /Forbidden/);
  await f.create().prepare(f.groups());
  assert.equal(f.channels.wins.sends, 1);
  f.channels.wins.fail = null;
  assert.equal((await f.create().decide(f.request())).status, 'PUBLISHED');
  assert.equal(f.channels.wins.sends, 2);
});

test('long recaps are losslessly split with one control card; no pings or hidden truncation', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ ...row, pick_id: `wager-${i}`, selection: `Original wager ${i}: ${'long terms '.repeat(12)}` }));
  const f = await fixture(rows), engine = f.create();
  assert.ok(f.groups()[0].parts.length > 1);
  assert.equal(f.groups()[0].parts.join(''), f.groups()[0].body);
  await engine.prepare(f.groups());
  assert.equal([...f.channels.review.records.values()].filter(m => m.payload.components.length).length, 1);
  await engine.decide(f.request());
  assert.equal(f.channels.wins.sends, f.groups()[0].parts.length);
  assert.ok([...f.channels.wins.records.values()].every(m => !m.payload.components.length && !m.payload.allowedMentions.parse.length));
});

test('failed privacy/destination preflight cannot send and disabled configuration does nothing', async () => {
  const f = await fixture();
  const engine = createRecapApprovals({ root: f.root, config, loadGroups: async () => f.groups(), channelFor: async () => { throw new Error('Private channel required'); } });
  await assert.rejects(engine.prepare(f.groups()), /Private channel/);
  assert.equal(f.channels.review.sends, 0);
  const disabled = createRecapApprovals({ root: f.root, config: { ...config, enabled: false }, channelFor: async () => { throw new Error('unexpected'); } });
  assert.deepEqual(await disabled.prepare(f.groups()), []);
});
