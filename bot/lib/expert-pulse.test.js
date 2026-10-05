const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createExpertPulse, manualSubmission, payloadFor, selections, summary, verifiedRecords } = require('./expert-pulse');

test('manual capper gets a private approval card and only publishes after approval', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'manual-expert-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const cards = new Map();
    const posts = new Map();
    const channel = (id, map) => ({ id, guild, permissionsFor: () => ({ has: () => false }),
      messages: { fetch: async (target) => typeof target === 'object' ? map : map.get(target) || null },
      send: async (payload) => {
        const item = { id: `${id}-${map.size + 1}`, ...payload,
          edit: async (next) => { Object.assign(item, next); return item; } };
        map.set(item.id, item);
        return item;
      } });
    const source = { id: '456', guild, messages: { fetch: async () => new Map() } };
    const review = channel('567', cards);
    const destination = channel('789', posts);
    const pulse = createExpertPulse({ sourceChannelFor: async () => source,
      reviewChannelFor: async () => review, destinationChannelFor: async () => destination,
      isApprover: ({ userId }) => userId === 'kobe',
      stateFile: path.join(directory, 'state.json') });
    await pulse.refresh();
    const aggregate = [...cards.values()][0];
    const submit = aggregate.components.flatMap((row) => row.components).find((button) => button.label === 'Submit capper');
    const digest = submit.custom_id.split(':')[2];
    const input = { digest, name: 'New Capper', message: 'A note from Kobe, without any claimed record.',
      userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567' };
    await assert.rejects(pulse.submitManual({ ...input, userId: 'other' }), /Only Kobe/);
    const result = await pulse.submitManual(input);
    assert.equal(result.status, 'PENDING');
    assert.equal(cards.size, 2);
    assert.equal(posts.size, 0);
    const card = cards.get(result.messageId);
    assert.match(card.embeds[0].description, /A note from Kobe/);
    assert.match(card.content, /No win rate has been verified/);
    assert.equal((await pulse.submitManual(input)).status, 'DUPLICATE');
    const edit = card.components[0].components.find((button) => button.label === 'Edit message');
    assert.ok(edit);
    const editArgs = { customId: edit.custom_id, userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567', messageId: card.id };
    assert.equal((await pulse.beginManualEdit(editArgs)).message, input.message);
    await assert.rejects(pulse.editManual({ id: result.messageId, messageId: card.id, message: 'Changed',
      userId: 'other', ownerId: 'kobe', guildId: '123', channelId: '567' }), /Only Kobe/);
    const id = edit.custom_id.split(':')[2];
    assert.equal((await pulse.editManual({ id, messageId: card.id, message: 'Exact revised note from Kobe.',
      userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567' })).status, 'UPDATED');
    assert.match(card.embeds[0].description, /Exact revised note/);
    const approve = card.components[0].components[0].custom_id;
    await assert.rejects(pulse.decideManual({ customId: approve, userId: 'other', ownerId: 'kobe',
      guildId: '123', channelId: '567', messageId: card.id }), /Only Kobe/);
    assert.equal((await pulse.decideManual({ customId: approve, userId: 'kobe', ownerId: 'kobe',
      guildId: '123', channelId: '567', messageId: card.id })).status, 'APPROVED');
    assert.equal(posts.size, 1);
    assert.match([...posts.values()][0].embeds[0].description, /Exact revised note/);
    assert.match([...posts.values()][0].content, /No win rate has been verified/);
    assert.equal((await pulse.decideManual({ customId: approve, userId: 'kobe', ownerId: 'kobe',
      guildId: '123', channelId: '567', messageId: card.id })).status, 'APPROVED');
    assert.equal(posts.size, 1);
    await pulse.refresh();
    assert.equal(posts.size, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
  assert.throws(() => manualSubmission('Ben Burns', '@everyone do this'), /Remove mentions/);
});

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
  assert.match(payloadFor(report).embeds[0].description, /Best records last 5 days/);
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
  assert.match(payloadFor({ date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 }, records).embeds[0].description, /Best records ever/);
});

test('expert feedback applies Kobe thresholds and ranks by verified win rate', () => {
  const rows = [
    { name: 'More Wins', wins: 6, losses: 4, pushes: 0, voids: 0, streak: 0, references: ['https://discord.com/1'], results: [] },
    { name: 'Better Rate', wins: 4, losses: 1, pushes: 0, voids: 0, streak: 0, references: ['https://discord.com/2'], results: [] },
    { name: 'Too Few', wins: 4, losses: 0, pushes: 0, voids: 0, streak: 4, references: ['https://discord.com/3'], results: [] }
  ];
  const text = payloadFor({ date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 }, rows).embeds[0].description;
  assert.match(text, /Better Rate \(4-1/);
  assert.doesNotMatch(text, /More Wins \(6-4/);
  assert.match(text, /Too Few \(4-0/);
});

test('expert cheat sheet uses Kobe’s five sections and strict cutoffs', () => {
  const day = (date, grade, sport = 'football') => ({
    at: Date.parse(`${date}T18:00:00Z`), grade, sport
  });
  const results = [
    day('2026-09-20', 'W'), day('2026-09-19', 'W'),
    day('2026-09-20', 'W', 'basketball'), day('2026-09-19', 'W', 'basketball'),
    day('2026-09-18', 'L', 'basketball')
  ];
  const records = [
    { name: 'Hot Expert', wins: 4, losses: 1, results },
    { name: 'Exactly Sixty', wins: 3, losses: 2,
      results: [day('2026-09-20', 'W'), day('2026-09-19', 'W'), day('2026-09-18', 'W'), day('2026-09-17', 'L'), day('2026-09-16', 'L')] },
    { name: 'Above Fifty Four', wins: 5, losses: 4,
      results: [day('2026-09-20', 'L'), ...Array.from({ length: 8 }, (_, index) => day(`2026-09-${String(12 - index).padStart(2, '0')}`, index < 5 ? 'W' : 'L'))] }
  ];
  const report = { date: '2026-09-21', active: [], repeated: [], playCount: 0, sourceCount: 0 };
  const text = payloadFor(report, records).embeds.map((embed) => embed.description).join('\n');
  assert.match(text, /\*\*Yesterday’s best plays · over 61%\*\*\nHot Expert \(2-0, 100%\)/);
  assert.match(text, /\*\*Best records last 5 days · over 61%\*\*\nHot Expert \(4-1, 80%\)/);
  assert.match(text, /\*\*Best football records · over 60% all time\*\*\nHot Expert \(2-0, 100%\)/);
  assert.match(text, /\*\*Best baseball records · over 60% all time\*\*/);
  assert.match(text, /\*\*Best records ever · over 61%\*\*\n\*\*5\+ settled picks\*\*\nHot Expert \(4-1, 80%\)/);
  const allTime = text.split('**Best records ever · over 61%**')[1];
  assert.doesNotMatch(allTime, /Exactly Sixty|Above Fifty Four/);
});

test('all-time cheat sheet separates tiny winning records from established records', () => {
  const report = { date: '2026-10-02', active: [], repeated: [], playCount: 0, sourceCount: 0 };
  const records = [
    { name: 'One Pick', wins: 1, losses: 0, results: [{ at: Date.parse('2026-10-01T18:00:00Z'), grade: 'W', sport: 'football' }] },
    { name: 'Six Picks', wins: 5, losses: 1, results: Array.from({ length: 6 }, (_, i) => ({ at: Date.parse('2026-09-28T18:00:00Z') + i * 3600000, grade: i ? 'W' : 'L', sport: 'football' })) },
  ];
  const text = payloadFor(report, records).embeds.map((embed) => embed.description).join('\n');
  const allTime = text.split('**Best records ever · over 61%**')[1];
  assert.match(allTime, /\*\*5\+ settled picks\*\*\nSix Picks \(5-1, 83\.3%\)/);
  assert.match(allTime, /\*\*Small sample: 1–4 settled picks\*\*\nOne Pick \(1-0, 100%\)/);
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
  assert.match(description, /Best records ever/);
  assert.match(description, /Verified Expert 120/);
});

test('keeps review private and prepares a dated review even when VIP privacy is unverified', async () => {
  const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
  const source = { id: '456', guild, messages: { fetch: async () => new Map() } };
  for (const visible of [true, undefined]) {
    const destination = { id: '789', guild, permissionsFor: () => ({ has: () => visible }) };
    const review = { id: '567', guild, permissionsFor: () => ({ has: () => false }),
      messages: { fetch: async () => new Map() }, send: async payload => ({ id: 'review-1', ...payload }) };
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-privacy-'));
    const pulse = createExpertPulse({
      sourceChannelFor: async () => source,
      reviewChannelFor: async () => review,
      destinationChannelFor: async () => destination,
      stateFile: path.join(directory, 'state.json'), now: () => Date.parse('2026-10-02T14:00:00Z')
    });
    try {
      const result = await pulse.refresh();
      assert.equal(result.status, 'VIP_HELD');
      assert.match(result.reason, /VIP destination privacy could not be verified/);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }
  const publicReview = { id: '567', guild, permissionsFor: () => ({ has: () => true }) };
  const pulse = createExpertPulse({ sourceChannelFor: async () => source,
    reviewChannelFor: async () => publicReview, destinationChannelFor: async () => ({ id: '789', guild }),
    stateFile: '/tmp/unused-expert-pulse-state.json' });
  await assert.rejects(pulse.refresh(), /review privacy could not be verified/);
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
    assert.equal((await pulse.refresh()).status, 'REVIEW_UPDATED');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('one review and one VIP message preserve separate expert decisions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const cards = new Map();
    const posts = new Map();
    let now = Date.parse('2026-09-21T18:00:00Z');
    const source = { id: '456', guild, messages: { fetch: async () => new Map() } };
    function grade(name, id, result = 'W') {
      return { pick_id: id, source_name: name, status: 'GRADED', result, wager_scope: 'individual',
        published_at: '2026-09-20T18:00:00Z', result_verified_source: 'https://www.espn.com/game/1',
        result_verified_at: new Date(now).toISOString(), post_reference: `https://discord.com/channels/123/789/${id}` };
    }
    let gradedRows = [grade('Ben Burns', '111'), grade('Kelly In Vegas', '222'), grade('The Prez', '333')];
    let nextMessageId = 0;
    function channel(id, map) {
      return { id, guild, permissionsFor: () => ({ has: () => false }),
        messages: { fetch: async (messageId) => typeof messageId === 'object' ? map : map.get(messageId) || null },
        send: async (payload) => {
          const message = { id: `${id}-${++nextMessageId}`, ...payload,
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
    assert.equal((await pulse.refresh()).expertCount, 3);
    assert.equal(cards.size, 1);
    assert.equal(posts.size, 0);
    const card = [...cards.values()][0];
    const selection = (action, name) => {
      const menu = card.components.flatMap((row) => row.components).find((part) => part.placeholder?.startsWith(action));
      return { customId: menu.custom_id, values: [menu.options.find((option) => option.label === name).value],
        userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567', messageId: card.id };
    };
    await assert.rejects(pulse.decide({ ...selection('Approve', 'Ben Burns'), userId: 'someone-else' }), /Only Kobe/);
    const oldBenApproval = selection('Approve', 'Ben Burns');
    assert.equal((await pulse.decide(selection('Reject', 'Kelly In Vegas'))).status, 'REJECTED');
    assert.equal(posts.size, 0);
    assert.equal((await pulse.decide(selection('Approve', 'Ben Burns'))).status, 'PUBLISHED');
    assert.equal(posts.size, 1);
    const fullButton = card.components.flatMap((row) => row.components).find((part) => part.label === 'Approve All');
    const fullParts = fullButton.custom_id.split(':');
    const fullApproval = { digest: fullParts[2], page: Number(fullParts[3]), confirmation: 'APPROVE ALL',
      userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567', messageId: card.id };
    await assert.rejects(pulse.approveAll({ ...fullApproval, confirmation: 'yes' }), /APPROVE ALL/);
    assert.equal((await pulse.approveAll(fullApproval)).count, 1);
    assert.equal(posts.size, 1);
    const editControl = card.components.flatMap((row) => row.components).find((part) => part.label === 'Edit Kobe note');
    const digest = editControl.custom_id.split(':')[2];
    await assert.rejects(pulse.editNote({ digest, note: 'Verified picks only', userId: 'not-kobe', ownerId: 'kobe', guildId: '123', channelId: '567' }), /Only Kobe/);
    await pulse.editNote({ digest, note: 'Verified picks only', userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567' });
    assert.match(card.content, /Kobe’s note:.*Verified picks only/);
    assert.match([...posts.values()][0].content, /Kobe’s note:.*Verified picks only/);
    let vipText = [...posts.values()][0].embeds.map((embed) => embed.description).join('\n');
    assert.match(vipText, /Ben Burns/);
    assert.match(vipText, /The Prez/);
    assert.doesNotMatch(vipText, /Kelly In Vegas/);
    assert.match(card.content, /2 approved · 1 rejected · 0 pending/);
    const statePath = path.join(directory, 'state.json');
    const benKey = createHash('sha256').update('benburns').digest('hex').slice(0, 16);
    const oldState = JSON.parse(await fs.readFile(statePath, 'utf8'));
    oldState.experts[benKey].evidence_digest = createHash('sha256').update(JSON.stringify([
      '2026-09-21', 'benburns', [['W', Date.parse('2026-09-20T18:00:00Z'),
        'https://discord.com/channels/123/789/111', '']]
    ])).digest('hex').slice(0, 20);
    await fs.writeFile(statePath, JSON.stringify(oldState));
    now += 86400000;
    await pulse.refresh();
    assert.match(card.content, /2 approved · 1 rejected · 0 pending/);
    assert.match([...posts.values()][0].embeds.map((embed) => embed.description).join('\n'), /Ben Burns/);
    const beforeFormatChange = JSON.parse(await fs.readFile(statePath, 'utf8'));
    beforeFormatChange.experts[benKey].digest = 'display-format-changed';
    await fs.writeFile(statePath, JSON.stringify(beforeFormatChange));
    await pulse.refresh();
    assert.match(card.content, /2 approved · 1 rejected · 0 pending/);
    assert.match([...posts.values()][0].embeds.map((embed) => embed.description).join('\n'), /Ben Burns/);
    gradedRows = [...gradedRows, grade('Ben Burns', '444')];
    assert.equal((await pulse.refresh()).status, 'REVIEW_UPDATED');
    assert.equal(cards.size, 1);
    vipText = [...posts.values()][0].embeds.map((embed) => embed.description).join('\n');
    assert.doesNotMatch(vipText, /Ben Burns/);
    assert.match(vipText, /The Prez/);
    await assert.rejects(pulse.decide(oldBenApproval), /stale/);
    assert.equal((await pulse.decide(selection('Approve', 'Ben Burns'))).status, 'PUBLISHED');
    assert.equal(posts.size, 1);
    gradedRows = [...gradedRows, grade('Ben Burns', '555', 'L'), grade('Ben Burns', '666', 'L'), grade('Ben Burns', '777', 'L')];
    assert.equal((await pulse.refresh()).expertCount, 2);
    assert.equal(posts.size, 1);
    assert.doesNotMatch([...posts.values()][0].embeds[0].description, /Ben Burns/);
    gradedRows = gradedRows.filter((row) => !['555', '666', '777'].includes(row.pick_id));
    assert.equal((await pulse.refresh()).expertCount, 3);
    assert.match(card.content, /1 pending/);
    assert.equal(cards.size, 1);
    const staleVipId = [...posts.keys()][0];
    posts.delete(staleVipId);
    const originalFetch = destination.messages.fetch;
    destination.messages.fetch = async (target) => {
      if (target === staleVipId) throw { code: 10008 };
      return originalFetch(target);
    };
    assert.equal((await pulse.refresh()).status, 'UNCHANGED');
    assert.equal(posts.size, 1);
    assert.notEqual([...posts.keys()][0], staleVipId);
    const replacementId = [...posts.keys()][0];
    destination.messages.fetch = async (target) => {
      if (target === replacementId) throw { code: 50013 };
      return originalFetch(target);
    };
    await assert.rejects(pulse.refresh(), (error) => error.code === 50013);
    assert.equal(posts.size, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('dropdown pages cover more than 25 experts while VIP remains one message', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-pages-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const cards = new Map();
    const posts = new Map();
    const now = Date.parse('2026-09-21T18:00:00Z');
    const rows = Array.from({ length: 27 }, (_, index) => ({
      pick_id: String(1000 + index), source_name: `Expert ${String(index + 1).padStart(2, '0')}`,
      status: 'GRADED', result: 'W', wager_scope: 'individual', published_at: '2026-09-20T18:00:00Z',
      result_verified_source: 'https://www.espn.com/game/1', result_verified_at: new Date(now).toISOString(),
      post_reference: `https://discord.com/channels/123/789/${1000 + index}`
    }));
    function channel(id, map) {
      return { id, guild, permissionsFor: () => ({ has: () => false }),
        messages: { fetch: async (target) => typeof target === 'object' ? map : map.get(target) || null },
        send: async (payload) => {
          const message = { id: `${id}-${map.size + 1}`, ...payload,
            edit: async (next) => { Object.assign(message, next); return message; },
            delete: async () => { map.delete(message.id); } };
          map.set(message.id, message);
          return message;
        } };
    }
    const pulse = createExpertPulse({ sourceChannelFor: async () => ({ id: '456', guild, messages: { fetch: async () => new Map() } }),
      reviewChannelFor: async () => channel('567', cards), destinationChannelFor: async () => channel('789', posts),
      rowsFor: async () => rows, paidChannelIds: ['789'], isApprover: ({ userId }) => userId === 'kobe',
      stateFile: path.join(directory, 'state.json'), now: () => now });
    assert.equal((await pulse.refresh()).expertCount, 27);
    const card = [...cards.values()][0];
    const controls = () => card.components.flatMap((row) => row.components);
    assert.equal(controls().find((control) => control.placeholder?.startsWith('Approve')).options.length, 25);
    const base = { userId: 'kobe', ownerId: 'kobe', guildId: '123', channelId: '567', messageId: card.id };
    assert.equal((await pulse.decide({ ...base, customId: controls().find((control) => control.label === 'Next').custom_id })).page, 2);
    const secondPage = controls().find((control) => control.placeholder?.startsWith('Approve'));
    assert.equal(secondPage.options.length, 2);
    assert.equal((await pulse.decide({ ...base, customId: secondPage.custom_id, values: [secondPage.options[1].value] })).status, 'PUBLISHED');
    assert.equal((await pulse.decide({ ...base, customId: controls().find((control) => control.label === 'Previous').custom_id })).page, 1);
    const firstPage = controls().find((control) => control.placeholder?.startsWith('Approve'));
    assert.equal((await pulse.decide({ ...base, customId: firstPage.custom_id, values: [firstPage.options[0].value] })).status, 'PUBLISHED');
    assert.equal(cards.size, 1);
    assert.equal(posts.size, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('existing individual cards consolidate without losing approved decisions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-pulse-migration-'));
  try {
    const guild = { id: '123', roles: { everyone: { id: 'everyone' } } };
    const cards = new Map();
    const posts = new Map();
    const now = Date.parse('2026-09-21T18:00:00Z');
    const names = ['Ben Burns', 'Kelly In Vegas'];
    const rows = names.map((name, index) => ({ pick_id: String(100 + index), source_name: name,
      status: 'GRADED', result: 'W', wager_scope: 'individual', published_at: '2026-09-20T18:00:00Z',
      result_verified_source: 'https://www.espn.com/game/1', result_verified_at: new Date(now).toISOString(),
      post_reference: `https://discord.com/channels/123/789/${100 + index}` }));
    function channel(id, map) {
      return { id, guild, permissionsFor: () => ({ has: () => false }),
        messages: { fetch: async (target) => typeof target === 'object' ? map : map.get(target) || null },
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
    const state = { version: 2, experts: {} };
    for (const [index, name] of names.entries()) {
      const key = createHash('sha256').update(name.toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex').slice(0, 16);
      const { expertNames, ...payload } = payloadFor(summary([], now), verifiedRecords([rows[index]], ['789']), { omitEmpty: true });
      const digest = createHash('sha256').update(payload.embeds.map((embed) => `${embed.title}\n${embed.description}`).join('\n')).digest('hex').slice(0, 20);
      const card = await review.send({ content: `Old card ${name}`, embeds: [{ title: name, description: name,
        footer: { text: `KBH expert-pulse-review-v1 · ${key} · ${digest}` } }], components: [] });
      const post = index === 0 ? await destination.send({ embeds: [{ title: name, description: name,
        footer: { text: `KBH expert-pulse-v1 · ${key} · ${digest}` } }] }) : null;
      state.experts[key] = { name, digest, status: index === 0 ? 'APPROVED' : 'REJECTED',
        review_message_id: card.id, posted_message_id: post?.id || null };
    }
    const stateFile = path.join(directory, 'state.json');
    await fs.writeFile(stateFile, JSON.stringify(state));
    const pulse = createExpertPulse({ sourceChannelFor: async () => ({ id: '456', guild, messages: { fetch: async () => new Map() } }),
      reviewChannelFor: async () => review, destinationChannelFor: async () => destination,
      rowsFor: async () => rows, paidChannelIds: ['789'], stateFile, now: () => now });
    await pulse.refresh();
    assert.equal(cards.size, 1);
    assert.equal(posts.size, 1);
    assert.match([...cards.values()][0].content, /1 approved · 1 rejected/);
    assert.match([...posts.values()][0].embeds[0].description, /Ben Burns/);
    assert.doesNotMatch([...posts.values()][0].embeds[0].description, /Kelly In Vegas/);
    assert.equal(JSON.parse(await fs.readFile(stateFile)).version, 3);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('sport records stay separate and five-day window excludes older results', () => {
  const at = (date) => Date.parse(`${date}T18:00:00Z`);
  const expert = (name, results) => ({ name, results, wins: results.filter(r => r.grade === 'W').length,
    losses: results.filter(r => r.grade === 'L').length, references: [] });
  const result = (date, sport, grade='W') => ({ at: at(date), sport, grade });
  const text = payloadFor({ date: '2026-09-26', active: [], repeated: [] }, [
    expert('Mixed', [result('2026-09-25','baseball'),result('2026-09-24','baseball'),result('2026-09-25','football','L')]),
    expert('Stale', [result('2026-09-20','baseball'),result('2026-09-19','baseball')]),
    expert('Gap', [result('2026-09-25','football'),result('2026-09-23','football')]),
    expert('Single', [result('2026-09-25','baseball'),result('2026-09-24','baseball'),result('2026-09-26','baseball','L')])
  ]).embeds.map(e => e.description).join('\n');
  const baseball = text.split('**Best baseball records · over 60% all time**')[1].split('**Best records ever')[0];
  assert.match(baseball, /Mixed \(2-0, 100%\)/);
  assert.match(baseball, /Single \(2-1, 66\.7%\)/);
  assert.doesNotMatch(baseball, /Gap/);
  const football = text.split('**Best football records · over 60% all time**')[1].split('**Best baseball')[0];
  assert.match(football, /Gap \(2-0, 100%\)/);
  assert.doesNotMatch(football, /Mixed/);
  const recent = text.split('**Best records last 5 days · over 61%**')[1].split('**Best football')[0];
  assert.doesNotMatch(recent, /Stale/);
});

test('Five Star Sports and Empire carry Kobe’s visual markers without changing other experts', () => {
  const at = Date.parse('2026-10-03T18:00:00Z');
  const records = ['Five Star Sports', 'Empire', 'Empire Elite'].map((name) => ({
    name, wins: 1, losses: 0, results: [{ grade: 'W', at, sport: 'football' }], references: []
  }));
  const { expertNames, embeds } = payloadFor({ date: '2026-10-04' }, records);
  const text = embeds.map((embed) => embed.description).join('\n');
  assert.match(text, /Five Star Sports ⭐🏈 \(1-0, 100%\)/);
  assert.match(text, /Empire ⭐🏈 \(1-0, 100%\)/);
  assert.match(text, /Empire Elite \(1-0, 100%\)/);
  assert.deepEqual(expertNames.sort(), ['Empire', 'Empire Elite', 'Five Star Sports']);
});
