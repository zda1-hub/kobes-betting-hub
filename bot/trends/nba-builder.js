'use strict';

// A private, short-lived research workspace. This never places a bet, computes
// parlay odds, or treats historical hit rates as a combined probability.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseLeg } = require('./combo-ledger');
const { combinationWarnings } = require('./analytics');
const { researchNba } = require('./nba-search');
const { researchNbaCombo } = require('./nba-combo-research');
const { playerNameKey } = require('./player-name');

const SESSION_MS = 30 * 60_000;
const QUOTE_MS = 5 * 60_000;
const MAX_LEGS = 4;
const queues = new Map();

function instant(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.valueOf())) throw new Error('Valid time required');
  return value;
}

function identify(root, userId) {
  if (!root || !/^\d{15,22}$/.test(String(userId || '')))
    throw new Error('Persistent trends root and Discord user ID required');
  const directory = path.join(root, 'trends-builders');
  const file = path.join(directory, `${crypto.createHash('sha256').update(String(userId)).digest('hex')}.json`);
  return { directory, file };
}

function serialize(file, operation) {
  const previous = queues.get(file) || Promise.resolve();
  const current = previous.then(operation, operation);
  queues.set(file, current.catch(() => {}));
  return current;
}

function empty(now) {
  return { version: 1, updatedAt: now.toISOString(), expiresAt: new Date(now.valueOf() + SESSION_MS).toISOString(), legs: [] };
}

function validStoredLeg(leg) {
  return leg && typeof leg === 'object' && typeof leg.player === 'string' &&
    typeof leg.team === 'string' && typeof leg.eventId === 'string' &&
    ['points', 'rebounds', 'assists'].includes(leg.stat) &&
    ['over', 'under'].includes(leg.side) && Number.isFinite(leg.line) &&
    leg.line >= 0 && leg.line <= 1000 && typeof leg.startsAt === 'string' &&
    Array.isArray(leg.offers) && typeof leg.checkedAt === 'string';
}

async function readSession(file, now) {
  let session;
  try { session = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return empty(now);
    throw new Error('NBA builder state could not be read', { cause: error });
  }
  if (session.version !== 1 || !Array.isArray(session.legs) || session.legs.length > MAX_LEGS ||
      !session.legs.every(validStoredLeg) || !Number.isFinite(Date.parse(session.expiresAt)))
    throw new Error('NBA builder state is invalid');
  if (Date.parse(session.expiresAt) > now.valueOf()) return session;
  await fs.rm(file, { force: true });
  return empty(now);
}

async function saveSession({ directory, file }, session) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(session), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}

function warningView(legs) {
  return combinationWarnings(legs.map((leg, index) => ({
    id: `${playerNameKey(leg.player)}:${leg.stat}:${leg.side}:${leg.line}`,
    gameId: leg.eventId,
    playerId: `${leg.team}:${playerNameKey(leg.player)}`
  }))).warnings;
}

function view(session, now) {
  return { legs: session.legs.map((leg, index) => ({ ...leg, number: index + 1,
    quoteFresh: Date.parse(leg.startsAt) > now.valueOf() &&
      leg.offers.some(offer => Number.isFinite(Date.parse(offer.updatedAt)) &&
      Date.parse(offer.updatedAt) <= now.valueOf() &&
      now.valueOf() - Date.parse(offer.updatedAt) <= QUOTE_MS) })),
    warnings: warningView(session.legs), expiresAt: session.expiresAt,
    combinedProbability: null, combinedPayout: null };
}

function checkedResult(result, query, now) {
  if (!result || typeof result !== 'object' || result.stat !== query.stat ||
      result.side !== query.side || result.line !== query.line ||
      !result.player || !result.team || !result.eventId ||
      !Number.isFinite(Date.parse(result.startsAt)) || Date.parse(result.startsAt) <= now.valueOf())
    throw new Error('Current NBA game and exact prop could not be verified');
  if (result.availability?.status !== 'active-roster-no-listed-injury' ||
      !Number.isFinite(Date.parse(result.availability.checkedAt)) ||
      now.valueOf() - Date.parse(result.availability.checkedAt) > QUOTE_MS ||
      Date.parse(result.availability.checkedAt) > now.valueOf())
    throw new Error('Player availability needs a current check; research only when resolved');
  if (!Number.isFinite(Date.parse(result.marketCheckedAt)) ||
      now.valueOf() - Date.parse(result.marketCheckedAt) > QUOTE_MS ||
      Date.parse(result.marketCheckedAt) > now.valueOf())
    throw new Error('Current NBA market check expired');
  const offers = (result.offers || []).filter(offer => offer.sportsbookKey &&
    Number.isFinite(offer.odds) && (offer.odds <= -100 && offer.odds >= -400 || offer.odds >= 100) &&
    Number.isFinite(Date.parse(offer.updatedAt)) && Date.parse(offer.updatedAt) <= now.valueOf() &&
    now.valueOf() - Date.parse(offer.updatedAt) <= QUOTE_MS)
    .map(offer => ({ sportsbook: offer.sportsbook, sportsbookKey: offer.sportsbookKey,
      odds: offer.odds, updatedAt: offer.updatedAt }));
  if (!offers.length) throw new Error('No fresh exact-line offer remains for this leg');
  return { player: result.player, team: result.team, opponent: result.opponent,
    eventId: result.eventId, startsAt: result.startsAt, stat: result.stat,
    side: result.side, line: result.line, offers, checkedAt: now.toISOString() };
}

function normalizedQuery(query) {
  if (query?.line === null || query?.line === undefined || query?.line === '')
    throw new Error('Choose an exact current line before adding a leg');
  const parsed = parseLeg(`NBA|${query.team}|${query.player}|${query.stat}|${query.side}|${query.line}`);
  if (parsed.sport !== 'NBA') throw new Error('NBA builder accepts NBA legs only');
  return parsed;
}

async function getNbaBuilder({ root, userId, now = new Date() }) {
  now = instant(now);
  const { file } = identify(root, userId);
  return serialize(file, async () => view(await readSession(file, now), now));
}

async function addNbaBuilderLeg({ root, userId, query, oddsKey, bdlKey,
  now = new Date(), fetchImpl = fetch, research = researchNba }) {
  now = instant(now);
  const location = identify(root, userId);
  const parsed = normalizedQuery(query);
  return serialize(location.file, async () => {
    const session = await readSession(location.file, now);
    if (session.legs.length >= MAX_LEGS) throw new Error('NBA builder holds at most four legs');
    const result = await research({ root, oddsKey, bdlKey, now, fetchImpl,
      team: parsed.team, player: parsed.player, stat: parsed.stat,
      side: parsed.side, line: parsed.line });
    const leg = checkedResult(result, parsed, now);
    if (session.legs.some(row => row.eventId === leg.eventId &&
        playerNameKey(row.player) === playerNameKey(leg.player) && row.stat === leg.stat &&
        row.side === leg.side && row.line === leg.line))
      throw new Error('This exact NBA prop is already in the builder');
    session.legs.push(leg);
    session.updatedAt = now.toISOString();
    session.expiresAt = new Date(now.valueOf() + SESSION_MS).toISOString();
    await saveSession(location, session);
    return view(session, now);
  });
}

async function removeNbaBuilderLeg({ root, userId, number, now = new Date() }) {
  now = instant(now);
  const location = identify(root, userId);
  return serialize(location.file, async () => {
    const session = await readSession(location.file, now);
    if (!Number.isInteger(number) || number < 1 || number > session.legs.length)
      throw new Error('Choose a leg number currently in the builder');
    session.legs.splice(number - 1, 1);
    session.updatedAt = now.toISOString();
    session.expiresAt = new Date(now.valueOf() + SESSION_MS).toISOString();
    await saveSession(location, session);
    return view(session, now);
  });
}

async function clearNbaBuilder({ root, userId, now = new Date() }) {
  now = instant(now);
  const location = identify(root, userId);
  return serialize(location.file, async () => {
    const session = empty(now);
    await saveSession(location, session);
    return view(session, now);
  });
}

async function reviewNbaBuilder({ root, userId, oddsKey, bdlKey,
  now = new Date(), fetchImpl = fetch, research = researchNbaCombo }) {
  now = instant(now);
  const location = identify(root, userId);
  return serialize(location.file, async () => {
    const session = await readSession(location.file, now);
    if (session.legs.length < 2) throw new Error('Choose two to four NBA legs before review');
    if (session.legs.some(leg => Date.parse(leg.startsAt) <= now.valueOf()))
      throw new Error('A selected game already started; remove that leg');
    const rawLegs = session.legs.map(leg =>
      `NBA|${leg.team}|${leg.player}|${leg.stat}|${leg.side}|${leg.line}`);
    const result = await research({ rawLegs, root, oddsKey, bdlKey, now, fetchImpl });
    // The combo research path checks each current market anew. Never return a
    // "current" builder review when any exact leg or availability check fails.
    if (result.legs.length !== session.legs.length)
      throw new Error('NBA combination research returned incomplete legs');
    for (const row of result.legs) {
      checkedResult(row, { stat: row.stat, side: row.side, line: row.line }, now);
    }
    return { ...result, warnings: [...new Set([...result.warnings, ...warningView(session.legs)])],
      combinedProbability: null, combinedPayout: null };
  });
}

function formatNbaBuilder(builder) {
  const safe = value => String(value).replace(/[@<>`*_~|]/g, ' ').replace(/\s+/g, ' ');
  const rows = builder.legs.map(leg => {
    const offer = leg.quoteFresh && leg.offers[0];
    const quote = offer ? `${offer.odds > 0 ? '+' : ''}${offer.odds} at ${safe(offer.sportsbook)}` :
      'quote stale; review again';
    return `${leg.number}. ${safe(leg.player)} ${leg.side} ${leg.line} ${leg.stat} — ${quote}`;
  });
  return `**Trends-tool · NBA builder (${builder.legs.length}/4)**\n` +
    `${rows.length ? rows.join('\n') : 'No legs yet. Search a current NBA prop to add one.'}\n` +
    `${builder.warnings.length ? `Caution: ${builder.warnings.map(safe).join('; ')}.\n` : ''}` +
    `Research only. No combined sportsbook quote or probability. Lines move; ` +
    `injury checks do not confirm participation. Session expires ${builder.expiresAt}.`;
}

module.exports = { SESSION_MS, MAX_LEGS, getNbaBuilder, addNbaBuilderLeg,
  removeNbaBuilderLeg, clearNbaBuilder, reviewNbaBuilder, formatNbaBuilder };
