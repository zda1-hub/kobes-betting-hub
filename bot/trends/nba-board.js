'use strict';

// A private, on-demand NBA board. It is a bounded research view, not a pick
// publisher: every displayed row has a fresh exact alternate quote, matched
// active game roster, completed-game history, and a current injury-list check.
const odds = require('./odds-api');
const bdl = require('./bdl-nba');
const { withOddsBudget } = require('./odds-budget');
const { selectEvent } = require('./current-market');
const { candidateOffers, MARKET_STATS } = require('./nba-auto');

const MARKETS = Object.keys(MARKET_STATS);
const cache = new Map();
const CACHE_MS = 45_000;

async function researchNbaBoard({ root, oddsKey, bdlKey, team, stat = 'all',
  minHitRate = 0.8, now = new Date(), fetchImpl = fetch,
  readEvents = odds.events, readOdds = odds.eventAlternateOdds,
  readEvent = bdl.exactEvent, readPlayer = bdl.exactActivePlayer,
  readHistory = bdl.history, readAvailability = bdl.availability,
  reserveOdds = withOddsBudget } = {}) {
  if (!root || !oddsKey || !bdlKey || !['all', 'points', 'rebounds', 'assists'].includes(stat) ||
      !Number.isFinite(minHitRate) || minHitRate < 0.8 || minHitRate > 1)
    throw new Error('NBA board needs a supported stat, hit-rate filter and data feeds');
  const schedule = await readEvents('NBA', { apiKey: oddsKey, fetchImpl });
  const event = selectEvent(schedule.data, team, now.valueOf());
  const key = `${root}:${event.id}:${stat}:${minHitRate}`;
  const cached = cache.get(key);
  if (cached && now.valueOf() - cached.at < CACHE_MS &&
      cached.rows.every(row => now.valueOf() - Date.parse(row.updatedAt) <= 5 * 60_000))
    return { ...cached.result, cached: true };
  const markets = stat === 'all' ? MARKETS : MARKETS.filter(market => MARKET_STATS[market] === stat);
  const quotes = await reserveOdds({ root, apiKey: oddsKey, fetchImpl, now,
    cost: markets.length, operation: () => readOdds('NBA', event.id,
      { apiKey: oddsKey, fetchImpl, ...(stat === 'all' ? {} : { market: markets[0] }) }) });
  const game = await readEvent({ event, now, apiKey: bdlKey, fetchImpl });
  const offers = candidateOffers(quotes.selections.filter(row => markets.includes(row.market)), now);
  const rows = [];
  const players = new Map();
  const statuses = new Map();
  for (const offer of offers) {
    try {
      let player = players.get(offer.player);
      if (!player) {
        player = await readPlayer({ name: offer.player, game, apiKey: bdlKey, fetchImpl });
        players.set(offer.player, player);
      }
      const history = await readHistory({ playerId: player.id, stat: MARKET_STATS[offer.market],
        line: offer.line, now, apiKey: bdlKey, fetchImpl });
      if (history.rightsUrl !== bdl.TERMS_URL || history.analysis.season.sample < 10 ||
          history.analysis.l20.sample < 20 || history.analysis.season.hitRate < minHitRate) continue;
      let availability = statuses.get(player.id);
      if (!availability) {
        availability = await readAvailability({ playerId: player.id, now,
          apiKey: bdlKey, fetchImpl });
        statuses.set(player.id, availability);
      }
      if (availability.status !== 'active-roster-no-listed-injury' ||
          availability.rightsUrl !== bdl.TERMS_URL) continue;
      const a = history.analysis;
      const score = 0.55 * a.season.hitRate + 0.1 * a.l5.hitRate +
        0.15 * a.l10.hitRate + 0.2 * a.l20.hitRate;
      rows.push({ player: `${player.first_name} ${player.last_name}`,
        team: player.team.full_name, stat: MARKET_STATS[offer.market], line: offer.line,
        odds: offer.odds, sportsbook: offer.sportsbook, updatedAt: offer.updatedAt,
        season: { hits: a.season.hits, sample: a.season.sample },
        l5: { hits: a.l5.hits, sample: a.l5.sample },
        l10: { hits: a.l10.hits, sample: a.l10.sample },
        l20: { hits: a.l20.hits, sample: a.l20.sample },
        score, availabilityCheckedAt: availability.checkedAt,
        historySource: history.sourceUrl });
    } catch { /* An unverified candidate is absent from the member board. */ }
  }
  rows.sort((a, b) => b.score - a.score ||
    b.season.sample - a.season.sample || b.odds - a.odds);
  const result = { event: { home: game.home_team.full_name,
    away: game.visitor_team.full_name, startsAt: game.datetime },
  checkedAt: now.toISOString(), stat, minHitRate, checkedOffers: offers.length,
  rows: rows.slice(0, 6) };
  cache.set(key, { at: now.valueOf(), result, rows: result.rows });
  return result;
}

function formatNbaBoard(board) {
  const counts = row => `${row.hits}/${row.sample}`;
  const lines = board.rows.map((row, index) =>
    `${index + 1}. **${row.player}** (${row.team}) over ${row.line} ${row.stat} · ` +
    `${row.odds > 0 ? '+' : ''}${row.odds} at ${row.sportsbook}\n` +
    `Season ${counts(row.season)} · L5 ${counts(row.l5)} · L10 ${counts(row.l10)} · ` +
    `L20 ${counts(row.l20)} · quote ${row.updatedAt}`);
  const content = `**Trends-tool · NBA current research board**\n` +
    `${board.event.away} at ${board.event.home} · ${board.event.startsAt}\n` +
    `${lines.length ? lines.join('\n') : `No qualifying current alternate props among ${board.checkedOffers} bounded candidates.`}\n` +
    `Checked ${board.checkedAt}. Active roster matched to this game; no injury entry was found for shown players. ` +
    `Participation is not confirmed. Historical rates are not next-game probabilities. ` +
    `Research only, not approved picks. Lines move. 21+.`;
  if (content.length > 1900) throw new Error('NBA board exceeds the private message limit');
  return content;
}

module.exports = { researchNbaBoard, formatNbaBoard };
