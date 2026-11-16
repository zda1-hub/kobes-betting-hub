'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const controls = require('./sports-control');

const OWNER = '123456789012345678';
const ADMIN = '223456789012345678';
const ROLE = '323456789012345678';

test('sports switches are durable, owner/admin-only and audit each change', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sports-control-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(controls.changeSport({ root, sport: 'nfl', on: false,
    actorId: ADMIN, guildOwnerId: OWNER, roleIds: [ROLE] }), /Only the server owner/);
  await controls.chooseAdminRole({ root, roleId: ROLE, actorId: OWNER, guildOwnerId: OWNER });
  const changed = await controls.changeSport({ root, sport: 'nfl', on: false,
    actorId: ADMIN, guildOwnerId: OWNER, roleIds: [ROLE] });
  assert.equal(changed.changed, true);
  assert.equal(await controls.isSportOn(root, 'nfl'), false);
  assert.equal((await controls.read(root)).adminRoleId, ROLE);
  const log = (await fs.readFile(path.join(root, 'trends', 'sports-control-audit.jsonl'), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.equal(log[1].actorId, ADMIN);
  assert.deepEqual([log[1].before, log[1].after], [true, false]);
});

test('paid sports cannot be enabled without key and unknown controls fail closed', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sports-control-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(controls.changeSport({ root, sport: 'nhl', on: true,
    actorId: OWNER, guildOwnerId: OWNER, keyOptions: { env: {} } }), /Add key first/);
  await assert.rejects(controls.changeSport({ root, sport: 'unknown', on: true,
    actorId: OWNER, guildOwnerId: OWNER }), /Unknown sport/);
  const next = await controls.changeSport({ root, sport: 'nhl', on: true,
    actorId: OWNER, guildOwnerId: OWNER,
    keyOptions: { env: {}, remoteKeys: { BDL_NHL_API_KEY: true }, providerReady: { nhl: true } } });
  assert.equal(next.state.sports.nhl, true);
});

test('command status and buttons hide enable action until key is set', () => {
  const state = { sports: { ...controls.INITIAL }, adminRoleId: null };
  const view = controls.render(state, { env: { BDL_NBA_API_KEY: 'fixture', ODDS_API_KEY: 'fixture' } });
  assert.equal(view.flags, 64);
  assert.match(view.content, /NHL: OFF · paid · key missing/);
  const button = view.components.flatMap(row => row.components).find(item => item.data?.custom_id === 'sports:nhl:on');
  assert.equal(button.data.disabled, true);
});

test('enabled sports require on, key and ready provider', () => {
  const state = { sports: { ...controls.INITIAL, cfb: true }, adminRoleId: null };
  assert.deepEqual(controls.enabledSports(state, { env: {
    BDL_NBA_API_KEY: 'fixture', ODDS_API_KEY: 'fixture'
  } }), ['nba', 'nfl']);
  assert.deepEqual(controls.enabledSports(state, { env: {
    BDL_NBA_API_KEY: 'fixture', ODDS_API_KEY: 'fixture'
  }, remoteKeys: { CFBD_API_KEY: true }, providerReady: { cfb: true } }), ['nba', 'nfl', 'cfb']);
});

test('feed threshold defaults to 80 and only owner or chosen admin can change it', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sports-threshold-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal((await controls.read(root)).feedThreshold, 80);
  await assert.rejects(controls.changeThreshold({ root, threshold: 70,
    actorId: ADMIN, guildOwnerId: OWNER, roleIds: [] }), /Only the server owner/);
  assert.equal((await controls.changeThreshold({ root, threshold: 70,
    actorId: OWNER, guildOwnerId: OWNER })).state.feedThreshold, 70);
  assert.match(controls.render(await controls.read(root)).content, /L10 ≥ 70%/);
});
