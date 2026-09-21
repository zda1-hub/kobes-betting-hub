const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createExpertPulse, payloadFor, selections, summary, verifiedRecords } = require('./expert-pulse');

test('counts structured picks from all qualifying posts today, not last week', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const posts = [
    { content: 'Ben Burns\n• Broncos ML -110\n• Cowboys +3', createdTimestamp: now - 1000 },
    { content: 'Kelly In Vegas\n• Broncos ML -110', createdTimestamp: now - 2000 },
    { content: 'Ben Burns\n• Old pick', createdTimestamp: now - 86400000 },
    { content: 'General chatter here', createdTimestamp: now - 1000 }
  ];
  assert.deepEqual(selections(posts[0]), ['Broncos ML -110', 'Cowboys +3']);
  const report = summary(posts, now);
  assert.equal(report.playCount, 3);
  assert.equal(report.sourceCount, 2);
  assert.equal(report.date, '2026-09-21');
  assert.deepEqual(report.repeated, [{ play: 'Broncos ML -110', count: 2 }]);
  assert.match(payloadFor(report).embeds[0].description, /Records and streaks are withheld until verified/);
});

test('reads production-style bot embeds but never merges odds or team-alias variants as a most-picked claim', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const report = summary([
    { content: '', embeds: [{ description: 'SmartMoneySports\n• Los Angeles Rams -6.5 -110 (3u)' }], createdTimestamp: now - 1000 },
    { content: '', embeds: [{ description: 'Pick Don\n• Rams -6.5' }], createdTimestamp: now - 2000 },
    { content: '', embeds: [{ description: 'Pardonmypick\n• 10u Rams -6.5 10U -120' }], createdTimestamp: now - 3000 }
  ], now);
  assert.equal(report.playCount, 3);
  assert.deepEqual(report.repeated, []);
  assert.match(payloadFor(report).embeds[0].description, /Exact-text repeats/);
});

test('shows all-time linked, individually graded paid expert results, including losses and pushes', () => {
  const now = Date.parse('2026-09-21T18:00:00Z');
  const published = new Date(now - 86400000).toISOString();
  const base = {
    pick_id: 'pick-1', status: 'GRADED', result: 'W', wager_scope: 'individual',
    source_name: 'Ben Burns', published_at: published,
    result_verified_source: 'https://www.espn.com/game/1',
    result_verified_at: new Date(now).toISOString(),
    post_reference: 'https://discord.com/channels/123/456/789'
  };
  const rows = [
    base,
    { ...base, pick_id: 'pick-2', published_at: '2025-01-01T12:00:00Z', post_reference: 'https://discord.com/channels/123/456/790' },
    { ...base, pick_id: 'pick-3', result: 'L', post_reference: 'https://discord.com/channels/123/456/794' },
    { ...base, pick_id: 'pick-4', result: 'P', post_reference: 'https://discord.com/channels/123/456/795' },
    { ...base, pick_id: 'group-parent', wager_scope: '', post_reference: 'https://discord.com/channels/123/456/796' },
    { ...base, pick_id: 'bad-1', result_verified_source: '', post_reference: 'https://discord.com/channels/123/456/791' },
    { ...base, pick_id: 'bad-2', post_reference: 'https://discord.com/channels/123/999/792' },
    { ...base, pick_id: 'bad-3', status: 'POST_FAILED', post_reference: 'https://discord.com/channels/123/456/793' }
  ];
  const records = verifiedRecords(rows, ['456']);
  assert.equal(records.length, 1);
  assert.equal(records[0].wins, 2);
  assert.equal(records[0].losses, 1);
  assert.equal(records[0].pushes, 1);
  assert.equal(records[0].streak, 0);
  assert.match(payloadFor({ date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 }, records).embeds[0].description, /2-1-1P-0V/);
});

test('refuses to draft or publish when review or VIP destination privacy is public or unverified', async () => {
  const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
  const source = { id: '456', guild };
  for (const visible of [true, undefined]) {
    const destination = { id: '789', guild, permissionsFor: () => ({ has: () => visible }) };
    const review = { id: '567', guild, permissionsFor: () => ({ has: () => false }) };
    const pulse = createExpertPulse({
      sourceChannelFor: async () => source,
      reviewChannelFor: async () => review,
      destinationChannelFor: async () => destination,
      stateFile: '/tmp/unused-expert-pulse-state.json'
    });
    await assert.rejects(pulse.refresh(), /privacy could not be verified/);
  }
});

test('owner approves an exact private review card once; changes require another approval', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const cards = new Map();
    const posts = new Map();
    const now = Date.parse('2026-09-21T18:00:00Z');
    let sourceMessages = [{ content: 'Ben Burns\n• Broncos ML -110', createdTimestamp: now - 1000 }];
    const source = { id: '456', guild, messages: { fetch: async () => new Map(sourceMessages.map((message, index) => [String(index), message])) } };
    function channel(id, map) {
      return { id, guild, permissionsFor: () => ({ has: () => false }), messages: { fetch: async (messageId) => typeof messageId === 'object' ? map : map.get(messageId) || null },
        send: async (payload) => {
          const message = { id: `${id}-${map.size + 1}`, embeds: payload.embeds,
            edit: async (next) => { message.embeds = next.embeds; return message; } };
          map.set(message.id, message);
          return message;
        } };
    }
    const review = channel('567', cards);
    const destination = channel('789', posts);
    const pulse = createExpertPulse({
      sourceChannelFor: async () => source,
      reviewChannelFor: async () => review,
      destinationChannelFor: async () => destination,
      isApprover: ({ userId, ownerId }) => userId === ownerId,
      stateFile: path.join(directory, 'state.json'), now: () => now
    });
    const initial = await pulse.refresh();
    assert.equal(initial.status, 'REVIEW_CREATED');
    assert.equal(posts.size, 0);
    const state = JSON.parse(await fs.readFile(path.join(directory, 'state.json')));
    const args = { customId: `expert-pulse:approve:${state.digest}`, userId: 'kobe', ownerId: 'kobe',
      guildId: '123', channelId: '567', messageId: initial.messageId };
    await assert.rejects(pulse.decide({ ...args, userId: 'someone-else' }), /Only Kobe/);
    assert.equal((await pulse.decide(args)).status, 'PUBLISHED');
    assert.equal(posts.size, 1);
    await assert.rejects(pulse.decide(args), /already decided/);
    sourceMessages = [...sourceMessages, { content: 'Kelly In Vegas\n• Cowboys +3', createdTimestamp: now - 500 }];
    assert.equal((await pulse.refresh()).status, 'REVIEW_UPDATED');
    assert.equal(posts.size, 1);
    await assert.rejects(pulse.decide(args), /stale/);
    const updated = JSON.parse(await fs.readFile(path.join(directory, 'state.json')));
    assert.equal((await pulse.decide({ ...args, customId: `expert-pulse:reject:${updated.digest}` })).status, 'REJECTED');
    assert.equal(posts.size, 1);
    assert.equal((await pulse.refresh()).status, 'UNCHANGED');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
