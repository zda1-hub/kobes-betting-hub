'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasVipAtSend, UPGRADE_COPY } = require('./vip-access');

test('VIP is checked against refreshed server roles, not the interaction snapshot', async () => {
  const interaction = { guildId: 'guild', user: { id: 'member' },
    member: { roles: { cache: new Map([['vip', {}]]) } } };
  const member = { roles: { cache: new Map() } };
  const client = { guilds: { fetch: async () => ({ members: { fetch: async () => member } }) } };
  assert.equal(await hasVipAtSend({ interaction, client, guildId: 'guild', roleIds: ['vip'] }), false);
  member.roles.cache.set('vip', {});
  assert.equal(await hasVipAtSend({ interaction, client, guildId: 'guild', roleIds: ['vip'] }), true);
});

test('wrong server or failed role lookup cannot reveal VIP result', async () => {
  const interaction = { guildId: 'other', user: { id: 'member' } };
  const client = { guilds: { fetch: async () => { throw new Error('unavailable'); } } };
  assert.equal(await hasVipAtSend({ interaction, client, guildId: 'guild', roleIds: ['vip'] }), false);
  interaction.guildId = 'guild';
  assert.equal(await hasVipAtSend({ interaction, client, guildId: 'guild', roleIds: ['vip'] }), false);
  assert.match(UPGRADE_COPY, /https:\/\/kobesbettinghub\.com\/join/);
  assert.doesNotMatch(UPGRADE_COPY, /L10|Odds API|[0-9]+\/[0-9]+/);
});
