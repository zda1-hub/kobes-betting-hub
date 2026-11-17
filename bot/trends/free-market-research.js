'use strict';

// Current MLB/NHL prop research for members. A quoted market and a historical
// hit rate do not establish next-game participation, so this module never
// authorizes automatic publication as a pick.
const { currentMarket } = require('./current-market');
const { research } = require('./free-leagues');
const { playerNameKey } = require('./player-name');

const ALLOWED_STATS = Object.freeze({
  MLB: new Set(['hits']),
  NHL: new Set(['shots_on_goal', 'points'])
});
const NHL_TEAM_ABBREVIATIONS = Object.freeze({
  'Anaheim Ducks': 'ANA', 'Boston Bruins': 'BOS', 'Buffalo Sabres': 'BUF',
  'Calgary Flames': 'CGY', 'Carolina Hurricanes': 'CAR', 'Chicago Blackhawks': 'CHI',
  'Colorado Avalanche': 'COL', 'Columbus Blue Jackets': 'CBJ', 'Dallas Stars': 'DAL',
  'Detroit Red Wings': 'DET', 'Edmonton Oilers': 'EDM', 'Florida Panthers': 'FLA',
  'Los Angeles Kings': 'LAK', 'Minnesota Wild': 'MIN', 'Montreal Canadiens': 'MTL',
  'Nashville Predators': 'NSH', 'New Jersey Devils': 'NJD', 'New York Islanders': 'NYI',
  'New York Rangers': 'NYR', 'Ottawa Senators': 'OTT', 'Philadelphia Flyers': 'PHI',
  'Pittsburgh Penguins': 'PIT', 'San Jose Sharks': 'SJS', 'Seattle Kraken': 'SEA',
  'St. Louis Blues': 'STL', 'Tampa Bay Lightning': 'TBL', 'Toronto Maple Leafs': 'TOR',
  'Utah Mammoth': 'UTA', 'Vancouver Canucks': 'VAN', 'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH', 'Winnipeg Jets': 'WPG'
});

function nhlEventTeamCode(event, query) {
  const needle = String(query).toLocaleLowerCase('en-US');
  const names = [event.home_team, event.away_team].filter(name =>
    String(name).toLocaleLowerCase('en-US').includes(needle));
  if (names.length !== 1 || !NHL_TEAM_ABBREVIATIONS[names[0]])
    throw new Error('NHL team could not be matched to one current event team');
  return NHL_TEAM_ABBREVIATIONS[names[0]];
}

async function researchFreeMarket({ root, apiKey, sport, team, player, stat,
  side = 'over', line = null, now = new Date(), fetchImpl = fetch,
  marketFn = currentMarket, historyFn = research } = {}) {
  sport = String(sport || '').toUpperCase();
  if (!ALLOWED_STATS[sport]?.has(stat)) throw new Error('Only supported MLB or NHL player prop markets can be researched');
  if (!['over', 'under'].includes(side) || !playerNameKey(player) || !String(team || '').trim())
    throw new Error('Enter a player, team and over/under side');
  if (line !== null && line !== undefined && (!Number.isFinite(line) || line < 0))
    throw new Error('Enter a nonnegative line or omit it to browse current offers');

  const market = await marketFn({ root, apiKey, sport, team, player, stat, side, line,
    now, fetchImpl });
  // The odds adapter has already required a real, fresh quote for this player,
  // side and exact line. Do not turn a nearby line into a claimed current offer.
  if (!market.offers?.length || !Number.isFinite(market.line) ||
      market.offers.some(offer => offer.line !== market.line ||
        playerNameKey(offer.player) !== playerNameKey(player)))
    throw new Error('No exact fresh offer for this player and line');

  const history = await historyFn({ sport, name: player,
    team: sport === 'NHL' ? nhlEventTeamCode(market.event, team) : undefined,
    stat, line: market.line,
    side, fetchImpl, now: now.valueOf() });
  if (!history?.analysis?.l20?.sample || !history.analysis.season.sample)
    throw new Error('Completed-game history is unavailable for this quoted prop');

  const compare = (games, threshold) => ({
    hits: games.filter(game => side === 'over' ? game.value > threshold : game.value < threshold).length,
    pushes: games.filter(game => game.value === threshold).length,
    sample: games.length
  });
  const alternateComparisons = (market.otherLines || []).slice(0, 4).map(offer => ({
    line: offer.line, odds: offer.odds, sportsbook: offer.sportsbook,
    season: compare(history.analysis.season.games, offer.line),
    l20: compare(history.analysis.l20.games, offer.line)
  }));

  return {
    sport, player, stat, side, line: market.line,
    event: market.event, offers: market.offers, otherLines: market.otherLines || [],
    oddsCheckedAt: market.fetchedAt, historyCheckedAt: history.checkedAt,
    sourceUrl: history.sourceUrl, scheduleUrl: history.scheduleUrl,
    analysis: history.analysis,
    alternateComparisons,
    availability: 'unverified',
    publicationEligible: false,
    note: 'A current quote and historical hit rate do not confirm the player will play. Research only; no pick is recommended.'
  };
}

function formatFreeMarket(result) {
  const count = window => `${window.hits}/${window.sample}${window.pushes ? ` (${window.pushes} pushes)` : ''}`;
  const offers = result.offers.slice(0, 4).map(row =>
    `${row.sportsbook}: ${row.odds > 0 ? '+' : ''}${row.odds} (updated ${row.updatedAt})`).join('\n');
  const compare = result.alternateComparisons.map(row =>
    `${row.line} ${row.odds > 0 ? '+' : ''}${row.odds} at ${row.sportsbook}: ` +
    `season ${row.season.hits}/${row.season.sample}, L20 ${row.l20.hits}/${row.l20.sample}`).join(' · ');
  return `**Trends-tool · ${result.sport} current prop research**\n` +
    `${result.event.away_team} at ${result.event.home_team} · ${result.event.commence_time}\n` +
    `${result.player}: ${result.side} ${result.line} ${result.stat.replaceAll('_', ' ')}\n` +
    `${offers}\nSeason: ${count(result.analysis.season)} · L5: ${count(result.analysis.l5)} · ` +
    `L10: ${count(result.analysis.l10)} · L20: ${count(result.analysis.l20)}\n` +
    (compare ? `Other current lines: ${compare}\n` : '') +
    `Odds checked ${result.oddsCheckedAt}; history checked ${result.historyCheckedAt}. ` +
    `[Completed-game source](${result.sourceUrl}).\n` +
    `${result.note} Counts are historical, not next-game probabilities.`;
}

module.exports = { researchFreeMarket, formatFreeMarket };
