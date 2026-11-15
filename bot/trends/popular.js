'use strict';

// A trend is popular only when measured within KBH. No claim about sportsbook
// bet volume or the general public is made from KBH search activity.
function buildPopularCard({ legs, searchEvidence, serviceDate, now = Date.now() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate || '')) throw new Error('Service date required');
  if (!Array.isArray(legs) || legs.length < 2 || legs.length > 4) throw new Error('Use 2–4 verified legs');
  if (!searchEvidence || searchEvidence.source !== 'kbh-prop-search' ||
      searchEvidence.serviceDate !== serviceDate || !Number.isInteger(searchEvidence.uniqueSearchers) ||
      searchEvidence.uniqueSearchers < 5 || !Array.isArray(searchEvidence.legIds) ||
      searchEvidence.legIds.length !== legs.length ||
      searchEvidence.legIds.slice().sort().join('|') !== legs.map(leg => leg.id).sort().join('|'))
    throw new Error('Measured KBH popularity for these exact legs required');
  if (new Set(legs.map(leg => leg.sportsbookKey)).size !== 1 || legs.some(leg => !leg.sportsbookKey))
    throw new Error('Every leg must be currently offered by the same verified sportsbook');
  const items = legs.map((leg) => {
    if (!leg.player || !leg.market || !leg.sportsbook || !Number.isFinite(leg.line) ||
        !Number.isInteger(leg.odds) || leg.odds < -400 || !leg.available ||
        !leg.updatedAt || !Number.isFinite(Date.parse(leg.updatedAt)) || Date.parse(leg.updatedAt) > now ||
        now - Date.parse(leg.updatedAt) > 5 * 60_000 ||
        !leg.gameId || !Number.isInteger(leg.recentHits) || !Number.isInteger(leg.recentSample) ||
        leg.recentSample < 2 || leg.recentHits < 0 || leg.recentHits > leg.recentSample ||
        !leg.analysisSource || !Number.isFinite(Date.parse(leg.analysisCheckedAt)) ||
        Date.parse(leg.analysisCheckedAt) > now ||
        !Number.isInteger(leg.seasonHits) || !Number.isInteger(leg.seasonSample) || leg.seasonSample < 10 ||
        leg.seasonHits < 0 || leg.seasonHits > leg.seasonSample ||
        !leg.availabilityVerified || !Number.isFinite(Date.parse(leg.availabilityCheckedAt)) ||
        Date.parse(leg.availabilityCheckedAt) > now ||
        now - Date.parse(leg.availabilityCheckedAt) > 30 * 60_000 ||
        !Number.isFinite(Date.parse(leg.startsAt)) || Date.parse(leg.startsAt) <= now)
      throw new Error('Current market, availability and verified history required for every leg');
    return `${leg.player}: ${leg.market} ${leg.line} (${leg.odds > 0 ? '+' : ''}${leg.odds}, ${leg.sportsbook}) — ${leg.recentHits}/${leg.recentSample} recent; ${leg.seasonHits}/${leg.seasonSample} season`;
  });
  return {
    title: `Popular trends among KBH searches · ${serviceDate}`,
    lines: items,
    evidence: `${searchEvidence.uniqueSearchers} distinct KBH searchers today`,
    footer: 'Historical hit rates are descriptive, not next-game or parlay probabilities. Lines move. 21+.',
    combinedProbability: null,
    combinedPayout: null
  };
}

module.exports = { buildPopularCard };
