'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { qualify } = require('./analytics');
const { belongsToServiceDate, localParts, TIME_ZONE } = require('./schedule');
const { playerNameKey } = require('./player-name');

const inFlight = new Map();
const DISPLAY_STATS = Object.freeze({
  points: 'points', rebounds: 'rebounds', assists: 'assists', receptions: 'receptions',
  receiving_yards: 'receiving yards', rushing_yards: 'rushing yards',
  passing_yards: 'passing yards', rush_receiving_yards: 'rush + receiving yards',
  anytime_touchdown: 'anytime touchdowns',
  shots_on_goal: 'shots on goal', hits: 'hits'
});

function assertEvidence(candidate, now) {
  const { prop, analysis, player, availability } = candidate || {};
  // Research availability is not publication permission. A source's own CC BY
  // label does not necessarily settle its upstream league-data rights.
  if (candidate?.rights?.history !== 'commercial-use-confirmed' ||
      candidate?.rights?.availability !== 'commercial-use-confirmed')
    throw new Error('Commercial source rights for history and availability are unconfirmed');
  if (!prop || !analysis?.season || !analysis?.l5 || !analysis?.l10 || !analysis?.l20 ||
      !player || !DISPLAY_STATS[prop.stat] || !['over', 'under'].includes(prop.side) ||
      !Number.isFinite(prop.line) || !prop.eventId || !prop.teamId || !prop.opponentId ||
      !availability || !['confirmed-active', 'active-roster-no-listed-injury'].includes(availability.status) ||
      !/^https:\/\//.test(availability.sourceUrl || '') ||
      (prop.sport === 'NBA' && ![
        'https://ak-static.cms.nba.com/referee/injury/',
        'https://api.balldontlie.io/v1/player_injuries'
      ].some(prefix => availability.sourceUrl.startsWith(prefix))) ||
      !Number.isFinite(Date.parse(availability.checkedAt)) ||
      now - Date.parse(availability.checkedAt) > 30 * 60_000 ||
      Date.parse(availability.checkedAt) > now ||
      (availability.status === 'confirmed-active' &&
        (!Number.isFinite(Date.parse(availability.sourceUpdatedAt)) ||
         now - Date.parse(availability.sourceUpdatedAt) > 30 * 60_000 ||
         Date.parse(availability.sourceUpdatedAt) > now)) ||
      (availability.status === 'active-roster-no-listed-injury' &&
        !((prop.sport === 'NBA' &&
           availability.sourceUrl.startsWith('https://api.balldontlie.io/v1/player_injuries') &&
           availability.rightsUrl === 'https://www.balldontlie.io/terms.html') ||
          (prop.sport === 'NFL' &&
           availability.sourceUrl.startsWith('https://github.com/nflverse/nflverse-data/releases/download/injuries/') &&
           availability.rosterSourceUrl?.startsWith('https://github.com/nflverse/nflverse-data/releases/download/rosters/') &&
           availability.rightsUrl === 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md' &&
           availability.gameWeek === availability.rosterWeek &&
           availability.gameWeek === availability.injuryFeedWeek &&
           Number.isFinite(Date.parse(availability.sourceUpdatedAt)) &&
           Date.parse(availability.sourceUpdatedAt) <= now &&
           now - Date.parse(availability.sourceUpdatedAt) <= 36 * 60 * 60_000 &&
           Number.isFinite(Date.parse(availability.rosterUpdatedAt)) &&
           Date.parse(availability.rosterUpdatedAt) <= now &&
           now - Date.parse(availability.rosterUpdatedAt) <= 36 * 60 * 60_000))) ||
      !/^https:\/\//.test(candidate.analysisSource || '') ||
      !Number.isFinite(Date.parse(candidate.analysisCheckedAt)) ||
      now - Date.parse(candidate.analysisCheckedAt) > 24 * 60 * 60_000 ||
      Date.parse(candidate.analysisCheckedAt) > now)
    throw new Error('Verified market, history and confirmed game-day status are required');
  const untilStart = Date.parse(prop.startsAt) - now;
  if (!Number.isFinite(untilStart) || untilStart > 90 * 60_000 || untilStart < 15 * 60_000 ||
      !belongsToServiceDate(prop.startsAt, localParts(now, TIME_ZONE).date))
    throw new Error('Trend can post only 15–90 minutes before a same-day game');
  if (analysis.l20.sample < 20) throw new Error('Twenty observed recent games are required');
  const gate = qualify(prop, analysis, { now, minSample: 10,
    allowPreGameAvailabilityCheck: availability.status === 'active-roster-no-listed-injury' });
  if (!gate.qualifies) throw new Error(`Trend does not qualify: ${gate.reasons.join(', ')}`);
  return gate;
}

function candidateId(candidate) {
  const { prop } = candidate;
  return crypto.createHash('sha256').update(JSON.stringify([
    prop.sport, prop.eventId, playerNameKey(candidate.player),
    prop.stat, prop.side, prop.line
  ])).digest('hex').slice(0, 32);
}

function renderCandidate(candidate, date) {
  const { prop, analysis, player } = candidate;
  const odds = prop.odds > 0 ? `+${prop.odds}` : String(prop.odds);
  const count = row => `${row.hits}/${row.sample}${row.pushes ? ` (${row.pushes} pushes)` : ''}`;
  const nfl = prop.sport === 'NFL';
  const splits = nfl ? [
    analysis.opponent?.sample ? `vs opponent ${count(analysis.opponent)}` : null,
    analysis.homeAway?.sample ? `${prop.location || 'home/away'} ${count(analysis.homeAway)}` : null
  ].filter(Boolean).join(' · ') : '';
  return `**Trends-tool · ${prop.sport} · ${date}**${nfl ? '' : ' · Lines move'}\n` +
    `**${player}: ${prop.side} ${prop.line} ${DISPLAY_STATS[prop.stat]}** · ${odds} at ${prop.sportsbook}\n` +
    `Historical hits: season ${count(analysis.season)} · L5 ${count(analysis.l5)} · ` +
    `L10 ${count(analysis.l10)} · L20 ${count(analysis.l20)}.${splits ? ` ${splits}.` : ''} ` +
    `[Game logs](${candidate.analysisSource})${nfl ? '\nData: nflverse (CC BY 4.0)\nResearch only, not a guarantee' : ' · Not a guarantee.'}`;
}

async function publishVerifiedCandidate({ root, candidate, channelId, channelFor, now = new Date() }) {
  if (!root || !/^\d{17,22}$/.test(String(channelId || '')) || typeof channelFor !== 'function')
    throw new Error('Verified private destination required');
  assertEvidence(candidate, now.valueOf());
  const date = localParts(now, TIME_ZONE).date;
  const id = candidateId(candidate);
  const directory = path.join(root, 'trends-publications', date);
  const file = path.join(directory, `${id}.json`);
  if (inFlight.has(file)) return inFlight.get(file);
  const run = (async () => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    let receipt;
    try { receipt = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (receipt) {
      if (receipt.channelId !== channelId) throw new Error('Trend destination changed; review prior receipt');
      if (receipt.status === 'published' && receipt.messageId) return { ...receipt, existing: true };
      throw new Error('Uncertain Trends send; reconcile the Discord message before retrying');
    }
    const channel = await channelFor(channelId);
    if (!channel?.isTextBased?.() || channel.id !== channelId)
      throw new Error('Trends destination is not the configured private text channel');
    const content = renderCandidate(candidate, date);
    if (content.length > 1900) throw new Error('Trend card exceeds Discord message limit');
    receipt = { version: 2, id, date, channelId, status: 'reserved',
      reservedAt: now.toISOString(), evidence: {
        eventId: candidate.prop.eventId, marketUpdatedAt: candidate.prop.updatedAt,
        statusCheckedAt: candidate.availability.checkedAt,
        historyCheckedAt: candidate.analysisCheckedAt
      }, monitorSource: {
        sport: candidate.prop.sport, eventId: candidate.prop.eventId,
        startsAt: candidate.prop.startsAt, player: candidate.player,
        playerId: candidate.playerId, market: candidate.prop.market,
        side: candidate.prop.side, line: candidate.prop.line,
        odds: candidate.prop.odds, sportsbookKey: candidate.prop.sportsbookKey
      }, originalContent: content };
    await fs.writeFile(file, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' });
    const message = await channel.send({ content, allowedMentions: { parse: [] },
      nonce: id.slice(0, 24), enforceNonce: true });
    if (!message?.id) throw new Error('Trend send returned no message ID; reconcile before retrying');
    receipt = { ...receipt, status: 'published', messageId: message.id,
      publishedAt: new Date().toISOString() };
    await fs.writeFile(file, JSON.stringify(receipt), { mode: 0o600 });
    return receipt;
  })();
  inFlight.set(file, run);
  try { return await run; } finally { inFlight.delete(file); }
}

module.exports = { assertEvidence, candidateId, renderCandidate, publishVerifiedCandidate };
