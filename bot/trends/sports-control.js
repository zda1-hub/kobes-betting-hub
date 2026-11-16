'use strict';

// Runtime member-search controls. The state lives beside the durable review
// queue, never in a repository or an ephemeral in-memory environment flag.
const fs = require('node:fs/promises');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder } = require('discord.js');

const CATALOG = Object.freeze({
  nba: { name: 'NBA', plan: 'paid', key: 'BDL_NBA_API_KEY' },
  nfl: { name: 'NFL', plan: 'free', key: null },
  cfb: { name: 'CFB', plan: 'free', key: 'CFBD_API_KEY' },
  cbb: { name: 'CBB', plan: 'free', key: 'CFBD_API_KEY' },
  nhl: { name: 'NHL', plan: 'paid', key: 'BDL_NHL_API_KEY' },
  mlb: { name: 'MLB', plan: 'paid', key: 'BDL_MLB_API_KEY' },
  epl: { name: 'EPL', plan: 'paid', key: 'BDL_EPL_API_KEY' },
  mls: { name: 'MLS', plan: 'paid', key: 'BDL_MLS_API_KEY' },
  ucl: { name: 'UCL', plan: 'paid', key: 'BDL_UCL_API_KEY' }
});
const INITIAL = Object.freeze({ nba: true, nfl: true, cfb: false, cbb: false,
  nhl: false, mlb: false, epl: false, mls: false, ucl: false });
const ROOT_FILE = 'sports-control.json';
const AUDIT_FILE = 'sports-control-audit.jsonl';

function statePath(root) { return path.join(root, 'trends', ROOT_FILE); }
function auditPath(root) { return path.join(root, 'trends', AUDIT_FILE); }

async function read(root) {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(root), 'utf8'));
    if (parsed?.version !== 1 || !parsed.sports || typeof parsed.sports !== 'object')
      throw new Error('Sports-control file has unexpected shape');
    return { version: 1, sports: { ...INITIAL, ...parsed.sports },
      adminRoleId: parsed.adminRoleId || null,
      feedThreshold: [70, 80].includes(parsed.feedThreshold) ? parsed.feedThreshold : 80 };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, sports: { ...INITIAL },
      adminRoleId: null, feedThreshold: 80 };
    throw error;
  }
}

async function write(root, state) {
  const target = statePath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temp, target);
}

async function audit(root, entry) {
  const target = auditPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n',
    { mode: 0o600 });
}

function authorized({ userId, guildOwnerId, roleIds = [], adminRoleId }) {
  return Boolean(userId && (userId === guildOwnerId ||
    (adminRoleId && roleIds.includes(adminRoleId))));
}

function keySet(sport, { env = process.env, remoteKeys = {} } = {}) {
  const item = CATALOG[sport];
  if (!item) return false;
  if (['nba', 'nfl'].includes(sport) && !env.ODDS_API_KEY) return false;
  if (!item.key) return true;
  if (Object.hasOwn(remoteKeys, item.key)) return remoteKeys[item.key] === true;
  return Boolean(env[item.key]);
}

function isEnabled(sport, state, options = {}) {
  const ready = { nba: true, nfl: true, ...(options.providerReady || {}) };
  return Object.hasOwn(CATALOG, sport) && state?.sports?.[sport] === true &&
    keySet(sport, options) && ready[sport] === true;
}

function enabledSports(state, options = {}) {
  return Object.keys(CATALOG).filter(sport => isEnabled(sport, state, options));
}

function statuses(state, options = {}) {
  return Object.entries(CATALOG).map(([id, item]) => ({ id, ...item,
    on: state.sports[id] === true, keySet: keySet(id, options),
    ready: Boolean(({ nba: true, nfl: true, ...(options.providerReady || {}) })[id]) }));
}

function render(state, options = {}) {
  const rows = statuses(state, options);
  const buttons = [];
  for (let offset = 0; offset < rows.length; offset += 5) {
    buttons.push(new ActionRowBuilder().addComponents(rows.slice(offset, offset + 5).map(row =>
      new ButtonBuilder().setCustomId(`sports:${row.id}:${row.on ? 'off' : 'on'}`)
        .setLabel(`${row.name} ${row.on ? 'Off' : !row.keySet ? 'Add key first' : row.ready ? 'On' : 'Not ready'}`.slice(0, 80))
        .setDisabled(!row.on && (!row.keySet || !row.ready))
        .setStyle(row.on ? ButtonStyle.Danger : ButtonStyle.Secondary))));
  }
  buttons.push(new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder().setCustomId('sports:admin-role').setPlaceholder('Owner: choose admin role')));
  buttons.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sports:threshold:70').setLabel('Feed L10 70%')
      .setStyle(state.feedThreshold === 70 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sports:threshold:80').setLabel('Feed L10 80%')
      .setStyle(state.feedThreshold !== 70 ? ButtonStyle.Primary : ButtonStyle.Secondary)));
  return { flags: 64, allowedMentions: { parse: [] },
    content: `**Trends-tool sports** · Feed threshold: L10 ≥ ${state.feedThreshold || 80}%\n${rows.map(row =>
      `${row.name}: ${row.on ? 'ON' : 'OFF'} · ${row.plan} · ${row.keySet ? 'key set / no key needed' : 'key missing'}${row.ready ? '' : ' · provider not ready'}`)
      .join('\n')}\nAdmin role: ${state.adminRoleId ? `<@&${state.adminRoleId}>` : 'not chosen'}`,
    components: buttons };
}

async function changeThreshold({ root, threshold, actorId, guildOwnerId, roleIds }) {
  const state = await read(root);
  if (!authorized({ userId: actorId, guildOwnerId, roleIds, adminRoleId: state.adminRoleId }))
    throw new Error('Only the server owner or chosen admin role can manage sports');
  if (![70, 80].includes(threshold)) throw new Error('Feed threshold must be 70 or 80');
  const before = state.feedThreshold;
  if (before === threshold) return { state, changed: false };
  state.feedThreshold = threshold;
  await write(root, state);
  await audit(root, { action: 'feed-threshold', actorId, before, after: threshold });
  return { state, changed: true };
}

async function changeSport({ root, sport, on, actorId, guildOwnerId, roleIds, keyOptions }) {
  const state = await read(root);
  if (!authorized({ userId: actorId, guildOwnerId, roleIds, adminRoleId: state.adminRoleId }))
    throw new Error('Only the server owner or chosen admin role can manage sports');
  if (!Object.hasOwn(CATALOG, sport) || typeof on !== 'boolean') throw new Error('Unknown sport switch');
  if (on && !keySet(sport, keyOptions)) throw new Error('Add key first');
  if (on && !({ nba: true, nfl: true, ...(keyOptions?.providerReady || {}) })[sport])
    throw new Error('Sport provider is not ready');
  const before = state.sports[sport];
  if (before === on) return { state, changed: false };
  state.sports[sport] = on;
  await write(root, state);
  await audit(root, { action: 'sport', actorId, sport, before, after: on });
  return { state, changed: true };
}

async function chooseAdminRole({ root, roleId, actorId, guildOwnerId }) {
  if (!actorId || actorId !== guildOwnerId) throw new Error('Only the server owner can choose this role');
  if (!/^\d{17,20}$/.test(roleId || '')) throw new Error('Select a server role');
  const state = await read(root);
  const before = state.adminRoleId;
  if (before === roleId) return { state, changed: false };
  state.adminRoleId = roleId;
  await write(root, state);
  await audit(root, { action: 'admin-role', actorId, before, after: roleId });
  return { state, changed: true };
}

async function isSportOn(root, sport) {
  const state = await read(root);
  return state.sports[sport] === true;
}

module.exports = { CATALOG, INITIAL, read, authorized, keySet, statuses, render,
  changeSport, changeThreshold, chooseAdminRole, isSportOn, isEnabled, enabledSports };
