'use strict';

// One member-requested NBA comparison, using only the licensed NBA feed and
// the same budgeted exact-market query as the pregame publisher.
const bdl = require('./bdl-nba');
const { currentMarket } = require('./current-market');

function counts(window) {
  if (!window?.sample) return 'unavailable';
  return `${window.hits}/${window.sample}${window.pushes ? ` (${window.pushes} pushes)` : ''}`;
}

function atLine(window, line, side) {
  const games = window.games || [];
  return { hits: games.filter(row => side === 'over' ? row.value > line : row.value < line).length,
    pushes: games.filter(row => row.value === line).length, sample: games.length };
}

async function researchNba({ root, oddsKey, bdlKey, team, player, stat, side, line,
  now = new Date(), fetchImpl = fetch, readMarket = currentMarket,
  readEvent = bdl.exactEvent, readPlayer = bdl.exactActivePlayer,
  readHistory = bdl.history, readAvailability = bdl.availability } = {}) {
  if (!root || !oddsKey || !bdlKey || !['points', 'rebounds', 'assists', 'threes', 'pra',
    'points_rebounds', 'points_assists', 'rebounds_assists'].includes(stat) ||
      !['over', 'under'].includes(side) ||
      (line !== null && line !== undefined && (!Number.isFinite(line) || line < 0)))
    throw new Error('NBA search needs a supported stat, side, threshold and both data feeds');
  const market = await readMarket({ root, apiKey: oddsKey, sport: 'NBA', team, player,
    stat, side, line, now, fetchImpl });
  const game = await readEvent({ event: market.event, now, apiKey: bdlKey, fetchImpl });
  const activePlayer = await readPlayer({ name: player, game, apiKey: bdlKey, fetchImpl });
  const [history, availability] = await Promise.all([
    readHistory({ playerId: activePlayer.id, stat, side, line: market.line, now, apiKey: bdlKey, fetchImpl }),
    readAvailability({ playerId: activePlayer.id, now, apiKey: bdlKey, fetchImpl })
  ]);
  if (history.rightsUrl !== bdl.TERMS_URL ||
      (availability.status === 'active-roster-no-listed-injury' && availability.rightsUrl !== bdl.TERMS_URL))
    throw new Error('NBA data source rights could not be verified');
  const offers = market.offers.map(row => ({ sportsbook: row.sportsbook,
    sportsbookKey: row.sportsbookKey, odds: row.odds, updatedAt: row.updatedAt }));
  const alternatives = market.otherLines.map(row => ({ line: row.line,
    sportsbook: row.sportsbook, odds: row.odds, updatedAt: row.updatedAt,
    season: atLine(history.analysis.season, row.line, side),
    l5: atLine(history.analysis.l5, row.line, side),
    l10: atLine(history.analysis.l10, row.line, side),
    l20: atLine(history.analysis.l20, row.line, side) }));
  return { player: `${activePlayer.first_name} ${activePlayer.last_name}`,
    team: activePlayer.team.full_name, teamAbbr: activePlayer.team.abbreviation,
    opponent: activePlayer.team.id === game.home_team.id ?
      game.visitor_team.full_name : game.home_team.full_name,
    startsAt: game.datetime, stat, side, line: market.line, offers, alternatives,
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
    result.alternatives.map(row => `${row.line}: ${price(row)} · season ${counts(row.season)} · ` +
      `L5 ${counts(row.l5)} · L10 ${counts(row.l10)} · L20 ${counts(row.l20)}`).join('\n') :
    'No other fresh alternate lines returned';
  const a = result.analysis;
  const injury = result.availability.status === 'active-roster-no-listed-injury' ?
    'active roster, no injury entry; participation not confirmed' :
    `injury entry reported; availability unconfirmed`;
  return `**Trends-tool · NBA member search**\n` +
    `${result.player} (${result.team}) vs ${result.opponent} · ${result.startsAt}\n` +
    `${result.side} ${result.line} ${result.stat}: ${current}.\n` +
    `Historical hits: season ${counts(a.season)} · L5 ${counts(a.l5)} · L10 ${counts(a.l10)} · L20 ${counts(a.l20)}. ` +
    `Recent observed average: ${a.l20.average === null ? 'unavailable' : a.l20.average.toFixed(1)} in ${a.l20.sample} games.\n` +
    `**Other available lines (same completed game logs):**\n${alternatives}\n` +
    `Availability: ${injury}. Market checked ${result.marketCheckedAt}; injury feed checked ${result.availability.checkedAt || 'unavailable'}. ` +
    `[Game-log source](${result.historySource}).\n` +
    `Historical rates are not next-game probabilities. Search results are research, not approved picks. Lines move; verify the current book.`;
}

module.exports = { researchNba, formatNbaResearch };
