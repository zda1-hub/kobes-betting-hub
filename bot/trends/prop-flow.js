'use strict';

const crypto = require('node:crypto');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const bdl = require('./bdl-nba');
const { readTeams } = require('./nba-profiles');
const { events, eventAlternateOdds } = require('./odds-api');
const { MARKET_BY_STAT } = require('./current-market');
const { withOddsBudget } = require('./odds-budget');
const { TEAM_NAMES, seasonFor } = require('./nfl-auto');
const { snapshot: nflContext, sourceFresh } = require('./nfl-context');
const { playerNameKey } = require('./player-name');

const STATS = Object.freeze({
  NBA: [['points', 'Pts'], ['rebounds', 'Reb'], ['assists', 'Ast'], ['threes', '3PM'],
    ['pra', 'PRA'], ['points_rebounds', 'P+R'], ['points_assists', 'P+A'], ['rebounds_assists', 'R+A']],
  NFL: [['passing_yards', 'Pass yds'], ['rushing_yards', 'Rush yds'], ['receiving_yards', 'Rec yds'],
    ['receptions', 'Receptions'], ['rush_receiving_yards', 'Rush+rec'], ['anytime_touchdown', 'Anytime TD']]
});
const sessions = new Map();
const TTL = 15 * 60_000;

function start(ownerId, channelId, now = Date.now(), leagues = ['NBA', 'NFL']) {
  const id = crypto.randomBytes(8).toString('hex');
  const state = { id, ownerId, channelId, stage: 'league', createdAt: now, page: 0, leagues };
  sessions.set(id, state);
  return state;
}
function get(id, ownerId, now = Date.now()) {
  const state = sessions.get(id);
  if (!state || now - state.createdAt > TTL) { sessions.delete(id); throw new Error('This search expired. Run /prop again.'); }
  if (state.ownerId !== ownerId) throw new Error('This private search belongs to another member.');
  return state;
}
function optionsRow(state, stage, options, page = 0) {
  const startAt = page * 25;
  const choices = options.slice(startAt, startAt + 25);
  const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`propflow:${state.id}:${stage}`).setPlaceholder(`Choose ${stage}`)
    .addOptions(choices.map(row => ({ label: row.label.slice(0, 100), value: row.value }))));
  const controls = new ActionRowBuilder();
  if (page > 0) controls.addComponents(new ButtonBuilder().setCustomId(`propflow:${state.id}:page:${page - 1}`)
    .setLabel('Previous').setStyle(ButtonStyle.Secondary));
  if (startAt + 25 < options.length) controls.addComponents(new ButtonBuilder()
    .setCustomId(`propflow:${state.id}:page:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary));
  if (stage === 'player' && options.length > 25) controls.addComponents(new ButtonBuilder()
    .setCustomId(`propflow:${state.id}:find`).setLabel('Search player').setStyle(ButtonStyle.Secondary));
  return [row, ...(controls.components.length ? [controls] : [])];
}
function render(state) {
  if (state.stage === 'league') return { content: 'Choose a league. Only enabled sports appear.',
    components: optionsRow(state, 'league', (state.leagues || ['NBA', 'NFL'])
      .map(value => ({ label: value, value }))) };
  const list = state.stage === 'team' ? state.teams : state.stage === 'player' ? state.players :
    state.stage === 'stat' ? STATS[state.league].map(([value, label]) => ({ value, label })) : state.lines;
  const label = { team: 'team playing in the next 7 days', player: 'active player',
    stat: 'statistic', line: 'quoted alternate line' }[state.stage];
  if (!list?.length) throw new Error(`No verified ${label} is available right now.`);
  return { content: `**${state.league}** · Choose ${label}.` +
    (state.stage === 'line' ? ' A custom threshold must still have a current quote.' : ''),
    components: optionsRow(state, state.stage, list, state.page || 0) };
}
async function loadTeams(state, { oddsKey, bdlKey, now = new Date(), fetchImpl = fetch }) {
  const response = await events(state.league, { apiKey: oddsKey, fetchImpl });
  const upcoming = response.data.filter(event => Date.parse(event.commence_time) > now.valueOf() &&
    Date.parse(event.commence_time) <= now.valueOf() + 7 * 86400_000);
  if (!upcoming.length) throw new Error('No games in this league in the next 7 days.');
  const names = [...new Set(upcoming.flatMap(row => [row.home_team, row.away_team]))];
  let teams;
  if (state.league === 'NBA') {
    // Unlike paginated player/game endpoints, BDL's teams endpoint returns
    // {data: [...]} without meta. Reuse the dedicated shape-checked adapter.
    const rows = await readTeams({ apiKey: bdlKey, fetchImpl });
    teams = names.map(name => rows.find(row => bdl.teamKey(row.full_name) === bdl.teamKey(name)))
      .filter(Boolean).map(row => ({ label: `${row.abbreviation} · ${row.full_name}`,
        value: row.abbreviation, name: row.full_name, teamId: row.id }));
  } else teams = names.map(name => {
    const entry = Object.entries(TEAM_NAMES).find(([, value]) => value === name);
    return entry && { label: `${entry[0]} · ${name}`, value: entry[0], name };
  }).filter(Boolean);
  state.teams = teams.sort((a, b) => a.value.localeCompare(b.value));
  if (!teams.length) throw new Error('Upcoming teams did not match the roster provider.');
}
async function loadPlayers(state, { bdlKey, now = new Date(), fetchImpl = fetch }) {
  let rows;
  if (state.league === 'NBA') {
    rows = await bdl.pages(`/v1/players/active?team_ids[]=${state.team.teamId}&per_page=100`,
      { apiKey: bdlKey, fetchImpl });
    rows = rows.filter(row => row.team?.id === state.team.teamId)
      .map(row => ({ label: `${row.first_name} ${row.last_name}`, value: String(row.id) }));
  } else {
    const data = await nflContext({ season: seasonFor(now), fetchImpl, now: now.valueOf() });
    if (!sourceFresh(data.rosterUpdatedAt, now.valueOf()))
      throw new Error('NFL active roster feed is stale');
    const byId = new Map();
    for (const row of data.rosters) if (row.team === state.team.value && row.gsis_id &&
      Number.isInteger(Number(row.week)) && (!byId.has(row.gsis_id) || Number(row.week) > Number(byId.get(row.gsis_id).week)))
      byId.set(row.gsis_id, row);
    rows = [...byId.values()].filter(row => row.status === 'ACT' && row.full_name)
      .map(row => ({ label: row.full_name, value: row.gsis_id }));
  }
  state.players = rows.sort((a, b) => a.label.localeCompare(b.label));
  if (!rows.length) throw new Error('No verified active roster players are available.');
}
async function loadLines(state, { root, oddsKey, now = new Date(), fetchImpl = fetch }) {
  const schedule = await events(state.league, { apiKey: oddsKey, fetchImpl });
  const matching = schedule.data.filter(row => [row.home_team, row.away_team].includes(state.team.name) &&
    Date.parse(row.commence_time) > now.valueOf() && Date.parse(row.commence_time) <= now.valueOf() + 7 * 86400_000)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
  if (!matching.length) throw new Error('Selected team has no upcoming event.');
  const market = MARKET_BY_STAT[state.league][state.stat];
  const odds = await withOddsBudget({ root, apiKey: oddsKey, fetchImpl, now, operation: () =>
    eventAlternateOdds(state.league, matching[0].id, { apiKey: oddsKey, fetchImpl, market }) });
  const seen = new Set();
  state.lines = odds.selections.filter(row => row.side === 'over' && row.market === market &&
    playerNameKey(row.player) === playerNameKey(state.player.label) &&
    Date.parse(row.updatedAt) <= now.valueOf() && now.valueOf() - Date.parse(row.updatedAt) <= 5 * 60_000)
    .sort((a, b) => a.line - b.line || b.odds - a.odds).filter(row => {
      if (seen.has(row.line)) return false;
      seen.add(row.line); return true;
    }).map(row => ({ label: `${row.line} (${row.odds > 0 ? '+' : ''}${row.odds} · ${row.sportsbook})`,
      value: String(row.line) }));
  if (!state.lines.length) throw new Error('No fresh quoted alternate lines for this player and stat.');
  state.lines.push({ label: 'Custom line (must be quoted)', value: 'custom' });
}
module.exports = { STATS, start, get, render, loadTeams, loadPlayers, loadLines, sessions };
