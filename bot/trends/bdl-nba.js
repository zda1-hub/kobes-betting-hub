'use strict';

// NBA-only paid-feed adapter. BALLDONTLIE ALL-STAR supplies completed game
// logs, active roster, and injury entries; exact current prices stay with the
// existing Odds API plan. No key is needed to load or test this module.
const { analyze } = require('./analytics');
const { playerNameKey } = require('./player-name');
const { localParts, TIME_ZONE } = require('./schedule');

const ORIGIN = 'https://api.balldontlie.io';
const TERMS_URL = 'https://www.balldontlie.io/terms.html';
const MAX_PAGES = 3;
const BDL_GAP_MS = 1200;
let requestTurn = Promise.resolve();
let nextRequestAt = 0;

async function pace(fetchImpl) {
  // Test fixtures do not touch the paid provider. Real calls share one lane
  // across member search, private proof and Tuesday rank refresh.
  if (fetchImpl !== fetch) return;
  const previous = requestTurn;
  let release;
  requestTurn = new Promise(resolve => { release = resolve; });
  await previous;
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  nextRequestAt = Date.now() + BDL_GAP_MS;
  release();
}

function teamKey(name) {
  return playerNameKey(name).replace(/^los angeles /, 'la ').replace(/^new york /, 'ny ');
}

function seasonStart(now) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 9 ? year : year - 1;
}

async function request(route, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('BALLDONTLIE API key is required');
  if (!route.startsWith('/v1/')) throw new Error('Unsupported BALLDONTLIE route');
  const send = async () => {
    await pace(fetchImpl);
    return fetchImpl(`${ORIGIN}${route}`, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  };
  let response = await send();
  if (response.status === 429 && fetchImpl === fetch) {
    const header = Number(response.headers?.get('retry-after'));
    const wait = Number.isFinite(header) && header > 0 ?
      Math.min(60_000, Math.max(1000, header * 1000)) : 60_000;
    await new Promise(resolve => setTimeout(resolve, wait));
    response = await send();
  }
  if (!response.ok) throw new Error(`BALLDONTLIE NBA request failed (${response.status})`);
  const body = await response.json();
  if (!Array.isArray(body?.data) || (body.meta !== undefined &&
      (!body.meta || typeof body.meta !== 'object' || Array.isArray(body.meta))))
    throw new Error(`BALLDONTLIE NBA response shape changed (${route.split('?')[0]})`);
  // Some short collection responses omit pagination metadata. The requested
  // page size is known, so only accept that omission when the page cannot be
  // full. A full page without a cursor could silently truncate game logs.
  if (body.meta === undefined) {
    const perPage = Number(new URL(`${ORIGIN}${route}`).searchParams.get('per_page') || 25);
    if (body.data.length >= perPage)
      throw new Error(`BALLDONTLIE NBA pagination metadata missing (${route.split('?')[0]})`);
    return { data: body.data, meta: { per_page: perPage } };
  }
  return body;
}

async function pages(route, options) {
  const out = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const suffix = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const body = await request(`${route}${suffix}`, options);
    out.push(...body.data);
    if (body.meta.next_cursor === undefined || body.meta.next_cursor === null) return out;
    if (String(body.meta.next_cursor) === String(cursor)) throw new Error('BALLDONTLIE pagination did not advance');
    cursor = body.meta.next_cursor;
  }
  throw new Error('BALLDONTLIE NBA pagination exceeded bounded scan');
}

async function exactEvent({ event, now, apiKey, fetchImpl }) {
  const date = localParts(event.commence_time, TIME_ZONE).date;
  const rows = await pages(`/v1/games?dates[]=${date}&per_page=100`, { apiKey, fetchImpl });
  const matches = rows.filter(game => game.status_state === 'scheduled' &&
    teamKey(game.home_team?.full_name) === teamKey(event.home_team) &&
    teamKey(game.visitor_team?.full_name) === teamKey(event.away_team) &&
    // The Odds API currently lists NBA tips about ten minutes after the
    // league schedule. Accept that bounded offset, then use the earlier
    // BALLDONTLIE tipoff for the actual publication cutoff.
    Math.abs(Date.parse(game.datetime) - Date.parse(event.commence_time)) <= 15 * 60_000 &&
    Date.parse(game.datetime) > now.valueOf());
  if (matches.length !== 1) throw new Error('NBA game and start time did not match across providers');
  return matches[0];
}

async function exactActivePlayer({ name, game, apiKey, fetchImpl }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  if (!first || !game?.home_team?.id || !game?.visitor_team?.id)
    throw new Error('NBA player or game is incomplete');
  const rows = await pages(`/v1/players/active?search=${encodeURIComponent(first)}&per_page=100`,
    { apiKey, fetchImpl });
  const matches = rows.filter(player =>
    playerNameKey(`${player.first_name} ${player.last_name}`) === playerNameKey(name) &&
    [game.home_team.id, game.visitor_team.id].includes(player.team?.id));
  if (matches.length !== 1) throw new Error('Exact active NBA player and game team were not verified');
  return matches[0];
}

function finalizedLogs(rows, { playerId, season, today, stat }) {
  const fields = { points: ['pts'], rebounds: ['reb'], assists: ['ast'], threes: ['fg3m'],
    pra: ['pts', 'reb', 'ast'], points_rebounds: ['pts', 'reb'],
    points_assists: ['pts', 'ast'], rebounds_assists: ['reb', 'ast'] }[stat];
  if (!fields) throw new Error('Unsupported NBA stat');
  return rows.filter(row => row.player?.id === playerId &&
    row.game?.season === season && row.game?.status_state === 'final' &&
    row.game?.postseason === false && row.game?.date < today &&
    Number.parseFloat(row.min) > 0 && fields.every(field => Number.isFinite(row[field])))
    .map(row => ({ gameId: String(row.game.id), date: row.game.date,
      season: String(season), status: 'final', participated: true,
      stats: { [stat]: fields.reduce((sum, field) => sum + row[field], 0) } }));
}

async function history({ playerId, stat, line, side = 'over', now = new Date(), apiKey, fetchImpl }) {
  if (!['over', 'under'].includes(side)) throw new Error('Unsupported NBA comparison side');
  const season = seasonStart(now);
  const today = now.toISOString().slice(0, 10);
  const load = async year => finalizedLogs(await pages(
    `/v1/stats?player_ids[]=${playerId}&seasons[]=${year}&season_type=regular&per_page=100`,
    { apiKey, fetchImpl }), { playerId, season: year, today, stat });
  const current = await load(season);
  const prior = current.length < 20 ? await load(season - 1) : [];
  const ids = new Set();
  const logs = [...current, ...prior].filter(row => {
    if (ids.has(row.gameId)) return false;
    ids.add(row.gameId); return true;
  });
  const recent = analyze(logs, { stat, line, side });
  const currentAnalysis = analyze(current, { stat, line, side, season: String(season) });
  return { analysis: { ...recent, season: currentAnalysis.season },
    sourceUrl: `${ORIGIN}/v1/stats?player_ids%5B%5D=${playerId}`,
    checkedAt: now.toISOString(), rightsUrl: TERMS_URL };
}

async function availability({ playerId, now = new Date(), apiKey, fetchImpl }) {
  const rows = await pages(`/v1/player_injuries?player_ids[]=${playerId}&per_page=100`,
    { apiKey, fetchImpl });
  if (rows.length) return { status: 'unconfirmed', reason: 'Player has an injury report entry',
    reportedStatuses: rows.map(row => row.status).filter(Boolean) };
  return { status: 'active-roster-no-listed-injury', checkedAt: now.toISOString(),
    sourceUrl: `${ORIGIN}/v1/player_injuries?player_ids%5B%5D=${playerId}`,
    rightsUrl: TERMS_URL };
}

module.exports = { ORIGIN, TERMS_URL, teamKey, seasonStart, request, pages,
  exactEvent, exactActivePlayer, finalizedLogs, history, availability };
