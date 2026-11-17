'use strict';

// Bounded, private research board. One Odds API event request supplies the
// quoted lines; completed-game sources supply counts. This module never posts
// a recommendation or treats a missing injury entry as confirmed availability.
const odds = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const { selectEvent } = require('./current-market');
const { research: nflResearch } = require('./nfl-search');
const { research: freeResearch } = require('./free-leagues');
const { playerNameKey } = require('./player-name');

const MARKET_STATS = Object.freeze({
  NFL: { player_receptions_alternate: 'receptions',
    player_reception_yds_alternate: 'receiving_yards',
    player_rush_yds_alternate: 'rushing_yards' },
  NHL: { player_shots_on_goal_alternate: 'shots_on_goal',
    player_points_alternate: 'points' },
  MLB: { batter_hits_alternate: 'hits' }
});
const MAX_CANDIDATES = Object.freeze({ NFL: 8, NHL: 6, MLB: 2 });
const CACHE_MS = 45_000;
const cache = new Map();

function seasonFor(sport, now) {
  const fields = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(fields.find(row => row.type === 'year').value);
  const month = Number(fields.find(row => row.type === 'month').value);
  return sport === 'NFL' && month < 7 ? year - 1 : year;
}

function candidateOffers(selections, sport, markets, now) {
  const best = new Map();
  for (const row of selections || []) {
    const updated = Date.parse(row.updatedAt);
    if (!markets.includes(row.market) || row.side !== 'over' ||
        !playerNameKey(row.player) || !Number.isFinite(row.line) ||
        !Number.isInteger(row.odds) || row.odds < -400 ||
        !row.sportsbook || !row.sportsbookKey ||
        !Number.isFinite(updated) || updated > now.valueOf() ||
        now.valueOf() - updated > 5 * 60_000) continue;
    const key = `${row.market}:${playerNameKey(row.player)}:${row.line}`;
    if (!best.has(key) || row.odds > best.get(key).odds) best.set(key, row);
  }
  // One line per player/stat prevents a heavily quoted player from taking
  // every source lookup. Prefer common negative prices over long-shot props.
  const players = new Set();
  return [...best.values()].sort((a, b) =>
    Math.abs(a.odds + 200) - Math.abs(b.odds + 200) ||
    a.player.localeCompare(b.player)).filter(row => {
    const key = `${row.market}:${playerNameKey(row.player)}`;
    if (players.has(key)) return false;
    players.add(key); return true;
  }).slice(0, MAX_CANDIDATES[sport]);
}

async function researchMultiSportBoard({ root, oddsKey, sport, team, stat = 'all',
  minHitRate = 0.8, now = new Date(), fetchImpl = fetch,
  readEvents = odds.events, readOdds = odds.eventAlternateOdds,
  readNfl = nflResearch, readFree = freeResearch,
  reserveOdds = withOddsBudget } = {}) {
  sport = String(sport || '').toUpperCase();
  if (!root || !oddsKey || !MARKET_STATS[sport] || !String(team || '').trim() ||
      !Number.isFinite(minHitRate) || minHitRate < 0.8 || minHitRate > 1 ||
      (stat !== 'all' && !Object.values(MARKET_STATS[sport]).includes(stat)))
    throw new Error('Board needs a supported league, team, stat, minimum and existing odds key');
  const schedule = await readEvents(sport, { apiKey: oddsKey, fetchImpl });
  const event = selectEvent(schedule.data || [], team, now.valueOf());
  const markets = Object.keys(MARKET_STATS[sport]).filter(market =>
    stat === 'all' || MARKET_STATS[sport][market] === stat);
  const key = `${root}:${sport}:${event.id}:${stat}:${minHitRate}`;
  const saved = cache.get(key);
  if (saved && now.valueOf() - saved.at < CACHE_MS &&
      saved.rows.every(row => now.valueOf() - Date.parse(row.updatedAt) <= 5 * 60_000))
    return { ...saved.result, cached: true };
  const quotes = await reserveOdds({ root, apiKey: oddsKey, fetchImpl, now,
    cost: markets.length,
    operation: () => readOdds(sport, event.id,
      { apiKey: oddsKey, fetchImpl, ...(markets.length === 1 ? { market: markets[0] } : {}) }) });
  const offers = candidateOffers(quotes.selections, sport, markets, now);
  const rows = [];
  for (const offer of offers) {
    try {
      const line = offer.line;
      const metric = MARKET_STATS[sport][offer.market];
      const source = sport === 'NFL' ? await readNfl({ player: offer.player,
        stat: metric, side: 'over', line, season: seasonFor(sport, now),
        fetchImpl, now: now.valueOf() }) : await readFree({ sport,
        name: offer.player, stat: metric, side: 'over', line,
        fetchImpl, now: now.valueOf() });
      if (playerNameKey(source.player || source.name) !== playerNameKey(offer.player)) continue;
      const analysis = source.analysis;
      const minimum = sport === 'NFL' ? 8 : 10;
      if (!analysis?.season || !analysis?.l20 ||
          analysis.season.sample < minimum || analysis.l20.sample < minimum ||
          analysis.season.hitRate < minHitRate || !/^https:\/\//.test(source.sourceUrl || '')) continue;
      // Do not infer affiliation or game-day participation from the quote.
      // NFL context is shown only when the source separately supplies it.
      const context = sport === 'NFL' && source.context?.rosterFresh ? source.context : null;
      rows.push({ player: offer.player, stat: metric, line, odds: offer.odds,
        sportsbook: offer.sportsbook, updatedAt: offer.updatedAt,
        season: analysis.season, l5: analysis.l5, l10: analysis.l10,
        l20: analysis.l20, sourceUrl: source.sourceUrl,
        roster: context?.roster || null, injury: context?.injury || null,
        checkedAt: source.checkedAt || source.fetchedAt || now.toISOString() });
    } catch { /* An unmatched source row is not a trend card. */ }
  }
  rows.sort((a, b) => b.season.hitRate - a.season.hitRate ||
    b.season.sample - a.season.sample || b.odds - a.odds);
  const result = { sport, event: { home: event.home_team,
    away: event.away_team, startsAt: event.commence_time },
  checkedAt: now.toISOString(), stat, minHitRate, checkedOffers: offers.length,
  rows: rows.slice(0, 5), publicationEligible: false };
  cache.set(key, { at: now.valueOf(), rows: result.rows, result });
  return result;
}

function formatMultiSportBoard(board) {
  const count = row => `${row.hits}/${row.sample}`;
  const lines = board.rows.map((row, index) =>
    `${index + 1}. **${row.player}** over ${row.line} ${row.stat.replaceAll('_', ' ')} · ` +
    `${row.odds > 0 ? '+' : ''}${row.odds} at ${row.sportsbook}\n` +
    `Season ${count(row.season)} · L5 ${count(row.l5)} · L10 ${count(row.l10)} · ` +
    `L20 ${count(row.l20)} · quote ${row.updatedAt} · [game logs](${row.sourceUrl})`);
  const result = `**Trends-tool · ${board.sport} current research board**\n` +
    `${board.event.away} at ${board.event.home} · ${board.event.startsAt}\n` +
    `${lines.length ? lines.join('\n') : `No qualifying current alternate props among ${board.checkedOffers} bounded candidates.`}\n` +
    `Checked ${board.checkedAt}. Lines may move. Player participation is not confirmed by a historical trend or a sportsbook quote. ` +
    `Historical rates are not next-game probabilities. Research only, not approved picks.`;
  if (result.length > 1900) throw new Error('Multi-sport board exceeds Discord message limit');
  return result;
}

module.exports = { MARKET_STATS, seasonFor, candidateOffers,
  researchMultiSportBoard, formatMultiSportBoard };
