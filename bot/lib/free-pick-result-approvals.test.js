const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { approvalConfig, publicCopy, createFreePickResultApprovals } = require('./free-pick-result-approvals');

const row = {
  pick_id: '20261109-181-X', operating_date: '2026-11-09', status: 'PUBLISHED',
  published_at: '2026-11-09T22:32:37Z', post_reference: 'https://discord.com/channels/123/456/789',
  selection: 'PJ Washington over 1.5 three-pointers made', published_line: '1.5', published_odds_american: '-113',
  result: 'W', score_or_outcome: '3 made threes on 6 attempts',
  result_verified_source: 'https://www.nba.com/game/example/box-score', result_verified_at: '2026-11-10T04:00:00Z',
};
const environment = {
  FREE_PICK_X_RESULT_REPLIES_ENABLED: 'true', FREE_PICK_X_RESULT_REPLY_START_AT: '2026-11-01T00:00:00Z',
  FREE_PICK_X_PUBLISH_URL: 'https://publisher.test', FREE_PICK_X_QUEUE_SECRET: 'fixture-secret',
};

function fakeChannel() {
  const saved = new Map();
  let nextId = 1000;
  const channel = { client: { user: { id: 'bot' } },
    messages: { fetch: async arg => typeof arg === 'string' ? saved.get(arg) : saved },
    send: async payload => {
      const id = String(++nextId);
      const message = { id, author: { id: 'bot' }, embeds: payload.embeds, components: payload.components,
        edit: async replacement => { message.embeds = replacement.embeds; message.components = replacement.components; } };
      saved.set(id, message);
      return message;
    } };
  return { channel, saved };
}

test('approval mode requires a private-channel ID and explicit cutover', () => {
  assert.equal(approvalConfig({}), null);
  assert.throws(() => approvalConfig({ FREE_PICK_RESULT_APPROVALS_ENABLED: 'true' }), /private review channel/);
  assert.deepEqual(approvalConfig({ FREE_PICK_RESULT_APPROVALS_ENABLED: 'true',
    SOCIAL_POST_APPROVAL_CHANNEL_ID: '555', PICK_APPROVAL_CHANNEL_ID: '444',
    FREE_PICK_RESULT_APPROVAL_START_AT: '2026-11-10T00:00:00Z' }),
  { reviewChannelId: '555', legacyReviewChannelId: '444', startAt: Date.parse('2026-11-10T00:00:00Z') });
  assert.throws(() => approvalConfig({ FREE_PICK_RESULT_APPROVALS_ENABLED: 'true',
    PICK_APPROVAL_CHANNEL_ID: '444', FREE_PICK_RESULT_APPROVAL_START_AT: '2026-11-10T00:00:00Z' }),
  /private review channel/);
});

test('pending legacy result card moves to the social channel and old buttons are disabled', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-result-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const old = fakeChannel();
  const social = fakeChannel();
  const channels = { '444': old.channel, '555': social.channel };
  const config = { reviewChannelId: '444', startAt: 0 };
  const args = { root, freePickChannelId: '456', reviewerIds: new Set(['kobe', 'owner']), guildId: '123',
    rowsFor: async () => [row], environment, channelFor: async id => channels[id] };
  await createFreePickResultApprovals({ ...args, config }).scan([row]);
  const oldMessage = [...old.saved.values()][0];
  const oldStateFile = (await fs.readdir(root)).find(name => name.endsWith('.json') && name !== 'opener-rotation.json');
  const oldState = JSON.parse(await fs.readFile(path.join(root, oldStateFile), 'utf8'));
  delete oldState.channelId; // Production cards created before channel tracking was added.
  await fs.writeFile(path.join(root, oldStateFile), JSON.stringify(oldState));
  const migrated = createFreePickResultApprovals({ ...args,
    config: { reviewChannelId: '555', legacyReviewChannelId: '444', startAt: 0 } });
  const receipt = await migrated.scan([row]);
  assert.equal(receipt[0].migrated, true);
  assert.equal(social.saved.size, 1);
  assert.equal(oldMessage.components[0].components[0].disabled, true);
  assert.equal((await migrated.scan([row])).length, 0);
  await assert.rejects(migrated.decide({ customId: oldMessage.components[0].components[0].custom_id,
    userId: 'kobe', requestGuildId: '123', channelId: '444', messageId: oldMessage.id }), /private result review channel/);
});

test('optional opener cannot alter locked result facts or claim certainty', () => {
  assert.match(publicCopy(row, 'That one got there.'), /FREE PICK RESULT: WIN/);
  assert.match(publicCopy(row), /Final: 3 made threes on 6 attempts/);
  assert.throws(() => publicCopy(row, 'FREE MONEY FR'), /unsupported certainty/);
  assert.throws(() => publicCopy({ ...row, result_verified_source: '' }), /not been verified/);
});

test('verified result is private until Kobe separately approves; one stable X request follows', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-result-approval-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { channel, saved } = fakeChannel();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/parent?')) return new Response(JSON.stringify({ xPostId: '2119921137475895375' }));
    return new Response(JSON.stringify({ status: 'published' }), { status: 201 });
  };
  let rows = [row];
  const instagram = [];
  const engine = createFreePickResultApprovals({ root, config: { reviewChannelId: '555', startAt: 0 },
    channelFor: async () => channel, rowsFor: async () => rows, freePickChannelId: '456',
    reviewerIds: new Set(['kobe', 'owner']), guildId: '123', environment, fetchImpl,
    queueInstagram: async request => { instagram.push(request); return { status: 'approved' }; } });
  assert.equal(await engine.verifyChannel(), true);
  assert.equal(calls.length, 0);
  const first = await engine.scan(rows);
  assert.equal(first[0].status, 'AWAITING_APPROVAL');
  assert.equal(saved.size, 1);
  assert.equal(calls.length, 0);
  assert.equal((await engine.scan(rows)).length, 0);
  const card = [...saved.values()][0];
  const editId = card.components[0].components[1].custom_id;
  const approveId = card.components?.[0]?.components?.[0]?.custom_id;
  const context = { userId: 'kobe', requestGuildId: '123', channelId: '555', messageId: card.id };
  await assert.rejects(engine.decide({ ...context, customId: approveId, userId: 'other' }), /Only Kobe or the KBH owner/);
  const draft = await engine.beginEdit({ ...context, customId: editId });
  await engine.edit({ ...context, key: draft.key, digest: draft.digest, opener: 'Nice read.' });
  assert.match(card.embeds[0].description, /Nice read/);
  const decision = await engine.decide({ ...context, customId: approveId });
  assert.equal(decision.status, 'X_REQUESTED');
  assert.equal(decision.instagram, 'QUEUED');
  assert.equal(instagram.length, 1);
  assert.match(instagram[0].copy, /Nice read\.[\s\S]*FREE PICK RESULT: WIN/);
  assert.equal(calls.length, 2);
  assert.equal(instagram.length, 1);
  assert.match(JSON.parse(calls[1].init.body).body, /Nice read\.[\s\S]*FREE PICK RESULT: WIN/);
  await assert.rejects(engine.decide({ ...context, customId: approveId }), /stale or already decided/);
  assert.equal((await engine.scan(rows)).length, 0);
  assert.equal(calls.length, 2);
  rows = [{ ...row, score_or_outcome: '4 made threes' }];
  assert.equal((await engine.scan(rows)).length, 0); // A changed settled result never silently republishes.
});

test('KBH owner can separately approve a verified result in the private Discord channel', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-owner-result-approval-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { channel, saved } = fakeChannel();
  let publicRequests = 0;
  const fetchImpl = async url => {
    if (String(url).includes('/parent?')) return new Response(JSON.stringify({ xPostId: '2119921137475895375' }));
    publicRequests++;
    return new Response(JSON.stringify({ status: 'requested' }), { status: 201 });
  };
  const engine = createFreePickResultApprovals({ root, config: { reviewChannelId: '555', startAt: 0 },
    channelFor: async () => channel, rowsFor: async () => [row], freePickChannelId: '456',
    reviewerIds: new Set(['kobe', 'owner']), guildId: '123', environment, fetchImpl });
  await engine.scan([row]);
  const card = [...saved.values()][0];
  const decision = await engine.decide({ customId: card.components[0].components[0].custom_id,
    userId: 'owner', requestGuildId: '123', channelId: '555', messageId: card.id });
  assert.equal(decision.status, 'X_REQUESTED');
  assert.equal(publicRequests, 1);
});

test('rejection does not call public publisher', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-result-reject-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { channel, saved } = fakeChannel();
  const engine = createFreePickResultApprovals({ root, config: { reviewChannelId: '555', startAt: 0 },
    channelFor: async () => channel, rowsFor: async () => [row], freePickChannelId: '456',
    reviewerIds: new Set(['kobe']), guildId: '123', environment,
    fetchImpl: async () => { throw new Error('Public request forbidden'); } });
  await engine.scan([row]);
  const card = [...saved.values()][0];
  const result = await engine.decide({ customId: card.components[0].components[2].custom_id,
    userId: 'kobe', requestGuildId: '123', channelId: '555', messageId: card.id });
  assert.equal(result.status, 'REJECTED');
});

test('safe Kobe result reactions rotate in private drafts without consecutive repeats', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-result-rotation-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { channel, saved } = fakeChannel();
  const second = { ...row, pick_id: '20261109-182-X' };
  const engine = createFreePickResultApprovals({ root, config: { reviewChannelId: '555', startAt: 0 },
    channelFor: async () => channel, rowsFor: async () => [row, second], freePickChannelId: '456',
    reviewerIds: new Set(['kobe']), guildId: '123', environment,
    randomIndex: () => 0, fetchImpl: async () => { throw new Error('No public request before approval'); } });
  await engine.scan([row, second]);
  const descriptions = [...saved.values()].map(message => message.embeds[0].description);
  assert.match(descriptions[0], /^CASHHH/);
  assert.match(descriptions[1], /^ANOTHER ONE/);
  assert.ok(descriptions.every(value => value.includes('FREE PICK RESULT: WIN')));
});

test('approved result waits for original X receipt and does not need a second approval', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-result-parent-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { channel, saved } = fakeChannel();
  let parentReady = false, publicRequests = 0;
  const fetchImpl = async url => {
    if (String(url).includes('/parent?')) return parentReady
      ? new Response(JSON.stringify({ xPostId: '2119921137475895375' }))
      : new Response('{}', { status: 404 });
    publicRequests++;
    return new Response('{}', { status: 201 });
  };
  const engine = createFreePickResultApprovals({ root, config: { reviewChannelId: '555', startAt: 0 },
    channelFor: async () => channel, rowsFor: async () => [row], freePickChannelId: '456',
    reviewerIds: new Set(['kobe']), guildId: '123', environment, fetchImpl });
  await engine.scan([row]);
  const card = [...saved.values()][0];
  const result = await engine.decide({ customId: card.components[0].components[0].custom_id,
    userId: 'kobe', requestGuildId: '123', channelId: '555', messageId: card.id });
  assert.equal(result.status, 'APPROVED_AWAITING_PARENT');
  assert.equal(publicRequests, 0);
  parentReady = true;
  assert.equal((await engine.scan([row]))[0].status, 'requested');
  assert.equal(publicRequests, 1);
  assert.equal((await engine.scan([row])).length, 0);
});
