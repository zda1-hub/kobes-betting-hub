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
  assert.match(payloadFor(report).embeds[0].description, /No verified expert currently meets this threshold/);
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
  assert.match(payloadFor(report).embeds[0].description, /Best Exclusive records L7 days/);
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
  assert.match(payloadFor({ date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 }, records).embeds[0].description, /Best exclusive records/);
});

test('expert feedback applies Kobe thresholds and ranks by verified win rate', () => {
  const rows = [
    { name: 'More Wins', wins: 6, losses: 4, pushes: 0, voids: 0, streak: 0, references: ['https://discord.com/1'], results: [] },
    { name: 'Better Rate', wins: 4, losses: 1, pushes: 0, voids: 0, streak: 0, references: ['https://discord.com/2'], results: [] },
    { name: 'Too Few', wins: 4, losses: 0, pushes: 0, voids: 0, streak: 4, references: ['https://discord.com/3'], results: [] }
  ];
  const text = payloadFor({ date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 }, rows).embeds[0].description;
  assert.ok(text.indexOf('Better Rate (4-1') < text.indexOf('More Wins (6-4'));
  assert.match(text, /Too Few \(4-0/);
});

test('large expert histories stay within the Discord embed description limit', () => {
  const records = Array.from({ length: 120 }, (_, index) => ({
    name: `Verified Expert ${String(index + 1).padStart(3, '0')}`,
    wins: 100 - (index % 20), losses: index % 10, pushes: 0, voids: 0,
    references: [`https://discord.com/channels/123/456/${1000 + index}`], results: []
  }));
  const embeds = payloadFor({ date: '2026-09-23', active: [], repeated: [], playCount: 0, sourceCount: 0 }, records).embeds;
  const description = embeds.map((embed) => embed.description).join('\n');
  assert.ok(embeds.every((embed) => embed.description.length <= 4096));
  assert.doesNotMatch(description, /more qualifying experts/);
  assert.match(description, /Best exclusive records ALL TIME/);
  assert.match(description, /Verified Expert 120/);
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

test('can reuse a private expert source as the VIP destination while keeping review separate', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-same-channel-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const source = { id: '456', guild, permissionsFor: () => ({ has: () => false }),
      messages: { fetch: async () => new Map() } };
    const review = { id: '567', guild, permissionsFor: () => ({ has: () => false }),
      messages: { fetch: async () => new Map() },
      send: async (payload) => ({ id: 'review-1', embeds: payload.embeds }) };
    const pulse = createExpertPulse({ sourceChannelFor: async () => source,
      reviewChannelFor: async () => review, destinationChannelFor: async () => source,
      stateFile: path.join(directory, 'state.json') });
    assert.equal((await pulse.refresh()).status, 'UNCHANGED');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('each expert requires a separate decision; rejected and changed experts stay off VIP', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const cards = new Map();
    const posts = new Map();
    const now = Date.parse('2026-09-21T18:00:00Z');
    const source = { id: '456', guild, messages: { fetch: async () => new Map() } };
    function grade(name, id, result = 'W') {
      return { pick_id: id, source_name: name, status: 'GRADED', result, wager_scope: 'individual',
        published_at: '2026-09-20T18:00:00Z', result_verified_source: 'https://www.espn.com/game/1',
        result_verified_at: new Date(now).toISOString(), post_reference: `https://discord.com/channels/123/789/${id}` };
    }
    let gradedRows = [grade('Ben Burns', '111'), grade('Kelly In Vegas', '222')];
    function channel(id, map) {
      return { id, guild, permissionsFor: () => ({ has: () => false }),
        messages: { fetch: async (messageId) => typeof messageId === 'object' ? map : map.get(messageId) || null },
        send: async (payload) => {
          const message = { id: `${id}-${map.size + 1}`, ...payload,
            edit: async (next) => { Object.assign(message, next); return message; },
            delete: async () => { map.delete(message.id); } };
          map.set(message.id, message);
          return message;
        } };
    }
    const review = channel('567', cards);
    const destination = channel('789', posts);
    const pulse = createExpertPulse({ sourceChannelFor: async () => source,
      reviewChannelFor: async () => review, destinationChannelFor: async () => destination,
      rowsFor: async () => gradedRows, paidChannelIds: ['789'],
      isApprover: ({ userId, ownerId }) => userId === ownerId,
      stateFile: path.join(directory, 'state.json'), now: () => now });
    assert.equal((await pulse.refresh()).expertCount, 2);
    assert.equal(cards.size, 2);
    assert.equal(posts.size, 0);
    const ben = [...cards.values()].find((card) => card.content.includes('Ben Burns'));
    const kelly = [...cards.values()].find((card) => card.content.includes('Kelly In Vegas'));
    const args = (card, action) => ({ customId: card.components[0].components.find((button) => button.label.startsWith(action)).custom_id,
      userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567', messageId: card.id });
    await assert.rejects(pulse.decide({ ...args(ben, 'Approve'), userId: 'someone-else' }), /Only Kobe/);
    assert.equal((await pulse.decide(args(kelly, 'Reject'))).status, 'REJECTED');
    assert.equal(posts.size, 0);
    assert.equal((await pulse.decide(args(ben, 'Approve'))).status, 'PUBLISHED');
    assert.equal(posts.size, 1);
    assert.match([...posts.values()][0].embeds[0].description, /Ben Burns/);
    assert.doesNotMatch([...posts.values()][0].embeds[0].description, /Kelly In Vegas/);
    await assert.rejects(pulse.decide(args(ben, 'Approve')), /already decided/);
    const oldBenApproval = args(ben, 'Approve');
    gradedRows = [...gradedRows, grade('Ben Burns', '333')];
    assert.equal((await pulse.refresh()).status, 'REVIEW_UPDATED');
    assert.equal(posts.size, 0);
    assert.match(ben.content, /Private review/);
    assert.match(kelly.content, /rejected/);
    await assert.rejects(pulse.decide(oldBenApproval), /changed/);
    assert.equal((await pulse.decide(args(ben, 'Approve'))).status, 'PUBLISHED');
    assert.equal(posts.size, 1);
    assert.equal((await pulse.refresh()).status, 'UNCHANGED');
    gradedRows = [...gradedRows, grade('Ben Burns', '444', 'L'), grade('Ben Burns', '555', 'L'), grade('Ben Burns', '666', 'L')];
    assert.equal((await pulse.refresh()).expertCount, 1);
    assert.equal(posts.size, 0);
    assert.match(ben.content, /no longer qualifies/);
    gradedRows = gradedRows.filter((row) => !['444', '555', '666'].includes(row.pick_id));
    assert.equal((await pulse.refresh()).expertCount, 2);
    assert.match(ben.content, /Private review/);
    assert.equal(posts.size, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('hot streaks include separate sports, require yesterday, and exclude incomplete today', () => {
  const at = (date) => Date.parse(`${date}T18:00:00Z`);
  const expert = (name, results) => ({ name, results, wins: results.filter(r => r.grade === 'W').length,
    losses: results.filter(r => r.grade === 'L').length, references: [] });
  const result = (date, sport, grade='W') => ({ at: at(date), sport, grade });
  const text = payloadFor({ date: '2026-09-26', active: [], repeated: [] }, [
    expert('Mixed', [result('2026-09-25','baseball'),result('2026-09-24','baseball'),result('2026-09-25','football','L')]),
    expert('Stale', [result('2026-09-22','baseball'),result('2026-09-21','baseball')]),
    expert('Gap', [result('2026-09-25','football'),result('2026-09-23','football')]),
    expert('Single', [result('2026-09-25','baseball'),result('2026-09-24','baseball'),result('2026-09-26','baseball','L')])
  ]).embeds.map(e => e.description).join('\n');
  const hot = text.split('**Hottest Experts')[1].split('**Best Exclusive')[0];
  assert.match(hot, /Mixed \(2-day unbeaten streak, baseball\)/);
  assert.match(hot, /Single \(2-day unbeaten streak, baseball\)/);
  assert.doesNotMatch(hot, /Stale|Gap|all sports/);
  assert.equal((hot.match(/Single/g) || []).length, 1);
});
