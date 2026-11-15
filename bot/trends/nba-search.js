'use strict';

// One member-requested NBA comparison, using only the licensed NBA feed and
// the same budgeted exact-market query as the pregame publisher.
const bdl = require('./bdl-nba');
const { currentMarket } = require('./current-market');

function counts(window) {
  return `${window.hits}/${window.sample}${window.pushes ? ` (${window.pushes} pushes)` : ''}`;
}

async function researchNba({ root, oddsKey, bdlKey, team, player, stat, side, line,
  now = new Date(), fetchImpl = fetch, readMarket = currentMarket,
  readEvent = bdl.exactEvent, readPlayer = bdl.exactActivePlayer,
  readHistory = bdl.history, readAvailability = bdl.availability } = {}) {
  if (!root || !oddsKey || !bdlKey || !['points', 'rebounds', 'assists'].includes(stat) ||
      !['over', 'under'].includes(side) || !Number.isFinite(line) || line < 0)
    throw new Error('NBA search needs a supported stat, side, threshold and both data feeds');
  const market = await readMarket({ root, apiKey: oddsKey, sport: 'NBA', team, player,
    stat, side, line, now, fetchImpl });
  const game = await readEvent({ event: market.event, now, apiKey: bdlKey, fetchImpl });
  const activePlayer = await readPlayer({ name: player, game, apiKey: bdlKey, fetchImpl });
  const [history, availability] = await Promise.all([
    readHistory({ playerId: activePlayer.id, stat, side, line, now, apiKey: bdlKey, fetchImpl }),
    readAvailability({ playerId: activePlayer.id, now, apiKey: bdlKey, fetchImpl })
  ]);
  if (history.rightsUrl !== bdl.TERMS_URL ||
      (availability.status === 'active-roster-no-listed-injury' && availability.rightsUrl !== bdl.TERMS_URL))
    throw new Error('NBA data source rights could not be verified');
  const offers = market.offers.map(row => ({ sportsbook: row.sportsbook,
    sportsbookKey: row.sportsbookKey, odds: row.odds, updatedAt: row.updatedAt }));
  const alternatives = market.otherLines.map(row => ({ line: row.line,
    sportsbook: row.sportsbook, odds: row.odds, updatedAt: row.updatedAt }));
  return { player: `${activePlayer.first_name} ${activePlayer.last_name}`,
    team: activePlayer.team.full_name, opponent: activePlayer.team.id === game.home_team.id ?
      game.visitor_team.full_name : game.home_team.full_name,
    startsAt: game.datetime, stat, side, line, offers, alternatives,
    eventId: market.event.id, market: market.market, leagueStartsAt: game.datetime,
    analysis: history.analysis, historySource: history.sourceUrl,
    historyCheckedAt: history.checkedAt, availability,
    marketCheckedAt: market.fetchedAt };
}

function formatNbaResearch(result) {
  const price = row => `${row.odds > 0 ? '+' : ''}${row.odds} at ${row.sportsbook}`;
  const current = result.offers.length ? result.offers.map(price).join('; ') :
    'No fresh exact-line offer returned';
  const alternatives = result.alternatives.length ?
    result.alternatives.map(row => `${row.line} ${price(row)}`).join('; ') : 'none returned';
  const a = result.analysis;
  const injury = result.availability.status === 'active-roster-no-listed-injury' ?
    'active roster, no injury entry; participation not confirmed' :
    `injury entry reported; availability unconfirmed`;
  return `**Trends-tool · NBA member search**\n` +
    `${result.player} (${result.team}) vs ${result.opponent} · ${result.startsAt}\n` +
    `${result.side} ${result.line} ${result.stat}: ${current}. Other fresh lines: ${alternatives}.\n` +
    `Historical hits: season ${counts(a.season)} · L5 ${counts(a.l5)} · L10 ${counts(a.l10)} · L20 ${counts(a.l20)}. ` +
    `Recent observed average: ${a.l20.average === null ? 'unavailable' : a.l20.average.toFixed(1)} in ${a.l20.sample} games.\n` +
    `Availability: ${injury}. Market checked ${result.marketCheckedAt}; injury feed checked ${result.availability.checkedAt || 'unavailable'}. ` +
    `[Game-log source](${result.historySource}).\n` +
    `Historical rates are not next-game probabilities. Search results are research, not approved picks. Lines move; verify the current book. 21+.`;
}

module.exports = { researchNba, formatNbaResearch };
