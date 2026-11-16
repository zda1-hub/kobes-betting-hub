'use strict';

const crypto = require('node:crypto');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { events } = require('./odds-api');
const { readTeams } = require('./nba-profiles');
const bdl = require('./bdl-nba');
const { TEAM_NAMES, seasonFor } = require('./nfl-auto');
const { snapshot: nflContext, sourceFresh } = require('./nfl-context');
const { STATS } = require('./prop-flow');
const { loadLines } = require('./prop-flow');

const sessions = new Map();
const TTL_MS = 15 * 60_000;
const ZONE = 'America/Los_Angeles';

function serviceDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric',
    month: '2-digit', day: '2-digit' }).format(value);
}
function start({ ownerId, channelId, leagues, now = new Date() }) {
  const state = { id: crypto.randomBytes(8).toString('hex'), ownerId, channelId,
    serviceDate: serviceDate(now), createdAt: now.valueOf(), leagues,
    sport: null, teams: [], players: [], selectedTeams: ['all'], selectedPlayers: ['all'],
    selectedStats: [], window: 'L10', line: null, teamPage: 0, playerPage: 0,
    games: [], controlMode: 'main', ladderOptions: [], ladderPage: 0 };
  sessions.set(state.id, state);
  return state;
}
function get(id, ownerId, now = new Date()) {
  const state = sessions.get(id);
  if (state && state.ownerId !== ownerId) throw new Error('This private search belongs to another member.');
  if (!state || now.valueOf() - state.createdAt > TTL_MS) {
    sessions.delete(id); throw new Error('This private search expired. Run /prop again.');
  }
  if (state.serviceDate !== serviceDate(now)) {
    sessions.delete(id); throw new Error('Today’s slate reset at midnight PT. Run /prop again.');
  }
  return state;
}
function choicesForPage(rows, page, allLabel) {
  const visible = rows.slice(page * 24, page * 24 + 24);
  return [{ label: allLabel, value: 'all' }, ...visible.map(row =>
    ({ label: row.label.slice(0, 100), value: row.value }))];
}
function mergePageSelection(previous, selected, rows, page) {
  if (selected.includes('all')) return ['all'];
  const visible = new Set(rows.slice(page * 24, page * 24 + 24).map(row => row.value));
  return [...new Set([...previous.filter(value => value !== 'all' && !visible.has(value)),
    ...selected.filter(value => visible.has(value))])];
}
function selectRow(id, kind, options, selected, disabled = false) {
  const menu = new StringSelectMenuBuilder().setCustomId(`bulk:${id}:${kind}`)
    .setPlaceholder(({ sport: 'Sport', team: 'Team(s)', player: 'Player(s)', stat: 'Stat(s)' })[kind])
    .setDisabled(disabled).setMinValues(1).setMaxValues(disabled ? 1 : Math.min(25, options.length))
    .addOptions(options.map(row => ({ label: row.label, value: row.value,
      default: selected.includes(row.value) })));
  return new ActionRowBuilder().addComponents(menu);
}
function render(state) {
  const teamChoices = state.sport ? choicesForPage(state.teams, state.teamPage, 'All teams today') :
    [{ label: 'Choose sport first', value: 'none' }];
  const playerChoices = state.sport ? choicesForPage(state.players, state.playerPage, 'All players') :
    [{ label: 'Choose sport and team(s) first', value: 'none' }];
  const statChoices = state.sport ? STATS[state.sport].map(([value, label]) => ({ label, value })) :
    [{ label: 'Choose sport first', value: 'none' }];
  const buttons = [
    new ButtonBuilder().setCustomId(`bulk:${state.id}:window`).setLabel(state.window)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bulk:${state.id}:line`)
      .setLabel(state.line === null ? 'Line / All 80%+' : `Line ${state.line}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bulk:${state.id}:team-page`)
      .setLabel(`Teams ${state.teamPage + 1}/${Math.max(1, Math.ceil(state.teams.length / 24))}`)
      .setDisabled(state.teams.length <= 24).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bulk:${state.id}:player-page`)
      .setLabel(`Players ${state.playerPage + 1}/${Math.max(1, Math.ceil(state.players.length / 24))}`)
      .setDisabled(state.players.length <= 24).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bulk:${state.id}:submit`).setLabel('Search')
      .setDisabled(!state.sport || !state.selectedStats.length).setStyle(ButtonStyle.Primary)
  ];
  const lineOptions = state.ladderOptions.slice(state.ladderPage * 21, state.ladderPage * 21 + 21);
  const controlRow = state.controlMode === 'line' ? new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bulk:${state.id}:line-choice`)
      .setPlaceholder('Book alt line, custom, or all 80%+')
      .addOptions([
        { label: 'All 80%+ hitters', value: 'all80' },
        { label: 'Custom line…', value: 'custom' },
        ...lineOptions,
        ...(state.ladderOptions.length > (state.ladderPage + 1) * 21 ?
          [{ label: 'More quoted lines…', value: 'next' }] : []),
        { label: 'Back to search', value: 'back' }
      ].slice(0, 25))) : new ActionRowBuilder().addComponents(buttons);
  return { content: `**Trends-tool · Today ${state.serviceDate} PT**\n` +
      'Choose sport, teams, players and stats on this panel, then Search once. ' +
      'All teams/players includes the full slate, not just the visible page. ' +
      `${state.line === null ? 'All 80%+ uses calculated thresholds with no book odds.' : `Custom calculated line: ${state.line}.`} ` +
      'Historical frequency is not a prediction.',
    components: [
      selectRow(state.id, 'sport', state.leagues.map(value => ({ label: value, value })), state.sport ? [state.sport] : []),
      selectRow(state.id, 'team', teamChoices, state.selectedTeams, !state.sport),
      selectRow(state.id, 'player', playerChoices, state.selectedPlayers, !state.sport || !state.teams.length),
      selectRow(state.id, 'stat', statChoices, state.selectedStats, !state.sport),
      controlRow
    ] };
}
async function loadLineChoices(state, { root, oddsKey, now = new Date(), fetchImpl = fetch }) {
  state.ladderOptions = [];
  const players = state.selectedPlayers.includes('all') ? state.players :
    state.players.filter(row => state.selectedPlayers.includes(row.value));
  if (players.length !== 1 || state.selectedStats.length !== 1) return;
  const player = players[0];
  const team = state.teams.find(row => row.value === player.team);
  if (!team) return;
  const single = { league: state.sport, team, player, stat: state.selectedStats[0] };
  try {
    await loadLines(single, { root, oddsKey, now, fetchImpl });
    state.ladderOptions = single.lines.filter(row => row.value !== 'custom').map(row =>
      ({ label: row.label.slice(0, 100), value: row.value }));
  } catch (error) {
    console.warn('Bulk alt-line quotes unavailable:', error.message);
  }
  state.ladderPage = 0;
}
async function loadTodayTeams(state, { oddsKey, bdlKey, now = new Date(), fetchImpl = fetch }) {
  const response = await events(state.sport, { apiKey: oddsKey, fetchImpl });
  const games = response.data.filter(game => serviceDate(new Date(game.commence_time)) === state.serviceDate &&
    Date.parse(game.commence_time) > now.valueOf());
  state.games = games;
  const names = [...new Set(games.flatMap(row => [row.home_team, row.away_team]))];
  if (state.sport === 'NBA') {
    const catalog = await readTeams({ apiKey: bdlKey, fetchImpl });
    state.teams = names.map(name => catalog.find(row => bdl.teamKey(row.full_name) === bdl.teamKey(name)))
      .filter(Boolean).map(row => ({ label: `${row.abbreviation} · ${row.full_name}`,
        value: row.abbreviation, name: row.full_name, teamId: row.id }));
  } else if (state.sport === 'NFL') {
    state.teams = names.map(name => {
      const found = Object.entries(TEAM_NAMES).find(([, full]) => full === name);
      return found && { label: `${found[0]} · ${name}`, value: found[0], name };
    }).filter(Boolean);
  } else state.teams = [];
  state.teams.sort((a, b) => a.value.localeCompare(b.value));
  if (!state.teams.length) throw new Error('No verified unstarted games in this sport today.');
  state.selectedTeams = ['all']; state.selectedPlayers = ['all']; state.selectedStats = [];
  state.teamPage = 0; state.playerPage = 0;
}
async function loadPlayers(state, { bdlKey, now = new Date(), fetchImpl = fetch }) {
  const teams = state.selectedTeams.includes('all') ? state.teams :
    state.teams.filter(row => state.selectedTeams.includes(row.value));
  if (!teams.length) throw new Error('Choose a team playing today.');
  if (state.sport === 'NBA') {
    const rows = [];
    for (let offset = 0; offset < teams.length; offset += 4) {
      const ids = teams.slice(offset, offset + 4).map(row => `team_ids[]=${row.teamId}`).join('&');
      rows.push(...await bdl.pages(`/v1/players/active?${ids}&per_page=100`, { apiKey: bdlKey, fetchImpl }));
    }
    state.players = rows.filter(row => teams.some(team => team.teamId === row.team?.id))
      .map(row => ({ label: `${row.first_name} ${row.last_name}`,
        value: String(row.id), team: row.team?.abbreviation, position: row.position }));
  } else {
    const data = await nflContext({ season: seasonFor(now), fetchImpl, now: now.valueOf() });
    if (!sourceFresh(data.rosterUpdatedAt, now.valueOf())) throw new Error('NFL active roster feed is stale');
    const latest = new Map();
    for (const row of data.rosters) if (row.gsis_id && teams.some(team => team.value === row.team) &&
      (!latest.has(row.gsis_id) || Number(row.week) > Number(latest.get(row.gsis_id).week)))
      latest.set(row.gsis_id, row);
    state.players = [...latest.values()].filter(row => row.status === 'ACT' && row.full_name)
      .map(row => ({ label: row.full_name, value: row.gsis_id,
        team: row.team, position: row.position }));
  }
  state.players.sort((a, b) => a.label.localeCompare(b.label));
  state.selectedPlayers = ['all']; state.playerPage = 0;
}

module.exports = { sessions, serviceDate, start, get, render, loadTodayTeams,
  loadPlayers, loadLineChoices, mergePageSelection };
