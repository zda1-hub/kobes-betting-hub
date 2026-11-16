'use strict';

// Publishes at most one NBA combination requested by five distinct KBH members
// that day. No inferred sportsbook-wide popularity, parlay price or probability.
const fs = require('node:fs/promises');
const path = require('node:path');
const { popularCombos } = require('./combo-ledger');
const { buildPopularCard } = require('./popular');
const { researchNba } = require('./nba-search');
const { events } = require('./odds-api');
const { selectEvent } = require('./current-market');
const { localParts, TIME_ZONE, belongsToServiceDate } = require('./schedule');

const MIN_BEFORE_MS = 15 * 60_000;
const MAX_BEFORE_MS = 90 * 60_000;

function selectEligibleCombo(combos, schedule, now, serviceDate, sport = 'NBA') {
  for (const combo of combos || []) {
    if (!combo.legs.every(leg => leg.sport === sport)) continue;
    try {
      const games = combo.legs.map(leg => selectEvent(schedule, leg.team, now.valueOf()));
      if (games.every(game => {
        const remaining = Date.parse(game.commence_time) - now.valueOf();
        return remaining >= MIN_BEFORE_MS && remaining <= MAX_BEFORE_MS &&
          belongsToServiceDate(game.commence_time, serviceDate);
      })) return combo;
    } catch { /* An ambiguous or unavailable matchup cannot qualify. */ }
  }
  return null;
}

function validatedLegs(combo, research, now) {
  const commonBooks = research[0].offers.map(row => row.sportsbookKey).filter(Boolean)
    .filter(key => research.every(result => result.offers.some(row => row.sportsbookKey === key)));
  if (!commonBooks.length) throw new Error('No common sportsbook offers every exact leg');
  const sportsbookKey = [...new Set(commonBooks)].sort()[0];
  return research.map((result, index) => {
    const offer = result.offers.find(row => row.sportsbookKey === sportsbookKey);
    const analysis = result.analysis;
    if (result.availability.status !== 'active-roster-no-listed-injury' ||
        !offer || analysis.season.sample < 10 || analysis.season.hitRate < 0.8 ||
        analysis.l20.sample < 20 || analysis.l20.hitRate < 0.8 ||
        Date.parse(result.leagueStartsAt) - now.valueOf() < MIN_BEFORE_MS)
      throw new Error('A leg lacks 80% verified season/L20 history or pregame availability');
    return { id: String(index), player: result.player, market: `${result.side} ${result.stat}`,
      line: result.line, odds: offer.odds, sportsbook: offer.sportsbook,
      sportsbookKey, available: true, updatedAt: offer.updatedAt,
      gameId: result.eventId, startsAt: result.leagueStartsAt,
      recentHits: analysis.l20.hits, recentSample: analysis.l20.sample,
      seasonHits: analysis.season.hits, seasonSample: analysis.season.sample,
      analysisSource: result.historySource, analysisCheckedAt: result.historyCheckedAt,
      availabilityVerified: true, availabilityCheckedAt: result.availability.checkedAt };
  });
}

function renderPopular(card) {
  return `**${card.title}**\n${card.lines.map((line, i) => `${i + 1}. ${line}`).join('\n')}\n` +
    `${card.evidence}. These are exact combinations members requested here, not sportsbook-wide betting volume.\n` +
    `${card.footer} No combined price is shown because the sportsbook has not quoted this exact combination.`;
}

async function scanNbaPopular({ root, oddsKey, bdlKey, channelId, channelFor,
  now = new Date(), fetchImpl = fetch, readCombos = popularCombos,
  readEvents = events, research = researchNba } = {}) {
  if (!root || !oddsKey || !bdlKey || !/^\d{17,22}$/.test(String(channelId || '')) ||
      typeof channelFor !== 'function') throw new Error('Private popular-trends configuration is incomplete');
  const serviceDate = localParts(now, TIME_ZONE).date;
  const receiptFile = path.join(root, 'trends-popular', `nba-${serviceDate}.json`);
  let existing;
  try { existing = JSON.parse(await fs.readFile(receiptFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) return { ...existing, existing: true };
  const measured = await readCombos({ root, now });
  const schedule = await readEvents('NBA', { apiKey: oddsKey, fetchImpl });
  const combo = selectEligibleCombo(measured.combos, schedule.data, now, serviceDate);
  if (!combo) return { status: 'waiting', serviceDate,
    reason: 'No measured five-member NBA combination has all legs in the pregame window' };
  await fs.mkdir(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
  const receipt = { version: 1, status: 'reserved', serviceDate, comboId: combo.id,
    channelId, distinctSearchers: combo.distinctSearchers, at: now.toISOString() };
  try { await fs.writeFile(receiptFile, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') return { status: 'reserved_elsewhere', serviceDate }; throw error; }
  let outcome;
  try {
    const researchRows = [];
    for (const leg of combo.legs) researchRows.push(await research({ root, oddsKey, bdlKey,
      team: leg.team, player: leg.player, stat: leg.stat, side: leg.side,
      line: leg.line, now, fetchImpl }));
    const legs = validatedLegs(combo, researchRows, now);
    const card = buildPopularCard({ legs, searchEvidence: {
      source: 'kbh-prop-search', serviceDate, uniqueSearchers: combo.distinctSearchers,
      legIds: legs.map(leg => leg.id)
    }, serviceDate, now: now.valueOf() });
    const content = renderPopular(card);
    if (content.length > 1900) throw new Error('Popular trend exceeds Discord message limit');
    const channel = await channelFor(channelId);
    if (!channel?.isTextBased?.() || channel.id !== channelId)
      throw new Error('Private popular-trends destination is unavailable');
    // A network failure after sending leaves the reservation uncertain. Never
    // retry automatically without reconciling the Discord message ID.
    outcome = { ...receipt, status: 'needs_reconciliation' };
    await fs.writeFile(receiptFile, JSON.stringify(outcome), { mode: 0o600 });
    const message = await channel.send({ content, allowedMentions: { parse: [] },
      nonce: combo.id.slice(0, 24), enforceNonce: true });
    if (!message?.id) throw new Error('Popular-trends send returned no message ID');
    outcome = { ...receipt, status: 'published', messageId: message.id,
      publishedAt: new Date().toISOString() };
  } catch (error) {
    outcome = { ...(outcome || receipt), status: outcome?.status === 'needs_reconciliation' ?
      'needs_reconciliation' : 'held', reason: error.message };
  }
  await fs.writeFile(receiptFile, JSON.stringify(outcome, null, 2), { mode: 0o600 });
  return outcome;
}

module.exports = { selectEligibleCombo, validatedLegs, renderPopular, scanNbaPopular };
