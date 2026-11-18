const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType, PermissionFlagsBits } = require('discord.js');
const { resolveWelcomeMessage, welcomeOverwrites, inspectWelcome, applyWelcome, syncFreeRole } = require('./member-welcome');

function fixture() {
  const events = [];
  const guild = { id: 'guild', client: { user: { id: 'bot' } } };
  const role = { id: 'free', name: 'Free', position: 1 };
  const botRole = { id: 'bot-role', name: 'Kobe Bot', position: 4 };
  guild.roles = { cache: new Collection([['free', role], ['bot-role', botRole]]), fetch: async () => guild.roles.cache };
  const channels = ['🆓・free-picks', '💬・community-chat'].map((name, i) => ({ id: String(i + 1), name, type: ChannelType.GuildText }));
  let pin = null;
  const start = { id: 'start', name: 'start-here', type: ChannelType.GuildText, parentId: null, position: 0,
    permissionOverwrites: { set: async (...args) => events.push(['overwrites', ...args]) },
    messages: { fetchPinned: async () => new Collection(pin ? [[pin.id, pin]] : []) },
    send: async payload => { events.push(['send', payload]); pin = {
      id: 'pin', author: { id: 'bot' }, edit: async data => events.push(['edit', data]),
      pin: async () => events.push(['pin']) }; return pin; } };
  guild.channels = { cache: new Collection([...channels, start].map(c => [c.id, c])), fetch: async () => guild.channels.cache };
  const makeMember = (id, initialRoles) => { const member = { id, guild, user: { bot: id === 'bot' } };
    member.roles = { cache: new Collection(initialRoles.map(id => [id, id === 'free' ? role : id === 'bot-role' ? botRole : { id }])),
      highest: id === 'bot' ? botRole : role,
      add: async item => { events.push(['add', id, item.id]); member.roles.cache.set(item.id, item); },
      remove: async item => { events.push(['remove', id, item.id]); member.roles.cache.delete(item.id); } };
    member.permissions = { has: () => false }; return member; };
  const members = [makeMember('bot', ['bot-role']), makeMember('free-user', []), makeMember('vip-user', ['vip', 'free'])];
  guild.members = { cache: new Collection(members.map(m => [m.id, m])), fetch: async () => guild.members.cache };
  return { guild, role, start, members, events };
}

test('welcome copy uses real channel mentions and fails closed if one is missing', () => {
  const { guild } = fixture();
  const copy = resolveWelcomeMessage(guild);
  assert.equal((copy.match(/<#1>/g) || []).length, 2);
  assert.match(copy, /graded right in <#1>, wins AND losses\. 26-17 since sep 22/);
  assert.match(copy, /<#2>/);
  guild.channels.cache.delete('1');
  assert.throws(() => resolveWelcomeMessage(guild), /#free-picks/);
});

test('Free-only overwrite denies everyone, allows Free reading, and blocks Free sending', () => {
  const { guild, role } = fixture();
  const [everyone, free, bot] = welcomeOverwrites(guild, role, { id: 'bot-role' });
  assert.equal(everyone.id, 'guild'); assert.ok(everyone.deny.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(free.allow.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(free.allow.includes(PermissionFlagsBits.ReadMessageHistory));
  assert.ok(free.deny.includes(PermissionFlagsBits.SendMessages));
  assert.ok(bot.allow.includes(PermissionFlagsBits.ManageMessages));
  const canView = memberRoleIds =>
    !everyone.deny.includes(PermissionFlagsBits.ViewChannel) ||
    (memberRoleIds.includes(free.id) && free.allow.includes(PermissionFlagsBits.ViewChannel));
  assert.equal(canView(['vip']), false);
  assert.equal(canView(['free']), true);
});

test('dry run counts members and makes no mutations; setup edits existing pin on rerun', async () => {
  const { guild, events, members } = fixture();
  const first = await inspectWelcome(guild, { vipIds: new Set(['vip']) });
  assert.equal(first.planned.backfillAdd, 1); assert.equal(first.planned.vipFreeRemove, 1);
  assert.equal(events.length, 0);
  await applyWelcome(first);
  assert.equal(events.filter(event => event[0] === 'send').length, 1);
  assert.equal(events.filter(event => event[0] === 'pin').length, 1);
  assert.equal(members[2].roles.cache.has('free'), false);
  const second = await inspectWelcome(guild, { vipIds: new Set(['vip']) });
  assert.equal(second.planned.backfillAdd, 0); assert.equal(second.planned.vipFreeRemove, 0);
  await applyWelcome(second);
  assert.equal(events.filter(event => event[0] === 'send').length, 1);
  assert.equal(events.filter(event => event[0] === 'edit').length, 1);
});

test('missing free-picks channel blocks apply before any role or channel change', async () => {
  const { guild, events } = fixture(); guild.channels.cache.delete('1');
  const plan = await inspectWelcome(guild, { vipIds: new Set(['vip']) });
  assert.match(plan.planned.blocked, /#free-picks/);
  await assert.rejects(applyWelcome(plan), /#free-picks/);
  assert.equal(events.length, 0);
});

test('approved setup creates only the Free role and top-level start-here channel', async () => {
  const { guild, role, start, events } = fixture();
  guild.roles.cache.delete(role.id); guild.channels.cache.delete(start.id);
  guild.roles.create = async options => { events.push(['create-role', options.name]); guild.roles.cache.set(role.id, role); return role; };
  guild.channels.create = async options => { events.push(['create-channel', options]); guild.channels.cache.set(start.id, start); return start; };
  const plan = await inspectWelcome(guild, { vipIds: new Set(['vip']) });
  assert.equal(plan.planned.role, 'create Free');
  assert.equal(plan.planned.channel, 'create #start-here at top level');
  assert.equal(events.length, 0);
  await applyWelcome(plan);
  const creation = events.find(event => event[0] === 'create-channel')[1];
  assert.equal(creation.position, 0); assert.equal(creation.name, 'start-here');
  assert.equal(creation.permissionOverwrites.length, 3);
  assert.equal(events.filter(event => event[0] === 'send').length, 1);
});

test('join gets Free, VIP grant removes it, VIP loss restores it', async () => {
  const { members } = fixture(); const member = members[1];
  assert.equal(await syncFreeRole(member, { enabled: true, vipIds: new Set(['vip']) }), 'added');
  assert.equal(member.roles.cache.has('free'), true);
  member.roles.cache.set('vip', { id: 'vip' });
  assert.equal(await syncFreeRole(member, { enabled: true, vipIds: new Set(['vip']) }), 'removed');
  assert.equal(member.roles.cache.has('free'), false);
  member.roles.cache.delete('vip');
  assert.equal(await syncFreeRole(member, { enabled: true, vipIds: new Set(['vip']) }), 'added');
  assert.equal(member.roles.cache.has('free'), true);
});
