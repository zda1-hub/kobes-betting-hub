'use strict';

const { normalizeLegs } = require('./combo-ledger');
const { combinationWarnings } = require('./analytics');
const { researchNba } = require('./nba-search');

async function researchNbaCombo({ rawLegs, root, oddsKey, bdlKey,
  now = new Date(), fetchImpl = fetch, research = researchNba } = {}) {
  const legs = normalizeLegs(rawLegs);
  if (legs.some(leg => leg.sport !== 'NBA')) throw new Error('NBA combo research supports NBA legs only');
  const results = [];
  for (const leg of legs) results.push(await research({ root, oddsKey, bdlKey,
    team: leg.team, player: leg.player, stat: leg.stat, side: leg.side,
    line: leg.line, now, fetchImpl }));
  const books = results[0].offers.map(offer => offer.sportsbookKey).filter(Boolean)
    .filter(key => results.every(row => row.offers.some(offer => offer.sportsbookKey === key)));
  const commonBook = [...new Set(books)].sort()[0] || null;
  const warnings = combinationWarnings(results.map((row, index) => ({
    id: String(index), gameId: row.eventId, playerId: `${row.team}:${row.player}`
  }))).warnings;
  return { legs: results, commonBook, warnings, checkedAt: now.toISOString(),
    combinedProbability: null, combinedPayout: null };
}

function formatNbaCombo(result) {
  const lines = result.legs.map((row, index) => {
    const offer = row.offers.find(item => item.sportsbookKey === result.commonBook);
    const best = offer || row.offers[0];
    const price = best ? `${best.odds > 0 ? '+' : ''}${best.odds} at ${best.sportsbook}` :
      'no fresh exact-line offer';
    const status = row.availability.status === 'active-roster-no-listed-injury' ?
      'no injury entry; participation unconfirmed' : 'injury/availability unconfirmed';
    return `${index + 1}. ${row.player} (${row.team}) ${row.side} ${row.line} ${row.stat}: ${price}. ` +
      `Season ${row.analysis.season.hits}/${row.analysis.season.sample}; ` +
      `L20 ${row.analysis.l20.hits}/${row.analysis.l20.sample}. ${status}.`;
  });
  const source = result.legs.every(row => /^https:\/\/api\.balldontlie\.io\/v1\/stats/.test(row.historySource || '')) ?
    'BALLDONTLIE completed game logs' : 'verified game logs';
  return `**Trends-tool · NBA combination research**\n${lines.join('\n')}\n` +
    `Same-book exact-leg offers: ${result.commonBook || 'none verified'}. ` +
    `${result.warnings.length ? `Risk: ${result.warnings.join('; ')}. ` : ''}` +
    `Checked ${result.checkedAt}. Sources: ${source}; The Odds API current markets and BALLDONTLIE injuries.\n` +
    `No combined sportsbook quote or dependency-aware probability was returned. ` +
    `Historical hits are not parlay probabilities. Research only; no pick or bet was placed. Lines move. 21+.`;
}

module.exports = { researchNbaCombo, formatNbaCombo };
