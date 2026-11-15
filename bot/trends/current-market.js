'use strict';

const { events, eventAlternateOdds } = require('./odds-api');
const { withOddsBudget } = require('./odds-budget');
const { playerNameKey } = require('./player-name');

const MARKET_BY_STAT = Object.freeze({
  NBA: { points: 'player_points_alternate', rebounds: 'player_rebounds_alternate', assists: 'player_assists_alternate' },
  NFL: { receptions: 'player_receptions_alternate', receiving_yards: 'player_reception_yds_alternate', rushing_yards: 'player_rush_yds_alternate' },
  NHL: { shots_on_goal: 'player_shots_on_goal_alternate', points: 'player_points_alternate' },
  MLB: { hits: 'batter_hits_alternate' }
});

function selectEvent(rows, team, now = Date.now()) {
  const needle = String(team || '').trim().toLocaleLowerCase('en-US');
  if (needle.length < 3) throw new Error('Enter at least three characters of a team name');
  const upcoming = rows.filter(row => Date.parse(row.commence_time) > now)
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
  const matches = upcoming.filter(row =>
    [row.home_team, row.away_team].some(name => String(name || '').toLocaleLowerCase('en-US').includes(needle)));
  if (!matches.length) {
    if (!upcoming.length) throw new Error('The Odds API lists no upcoming events for this league right now');
    const examples = upcoming.slice(0, 3).map(row => `${row.away_team} at ${row.home_team}`).join('; ');
    throw new Error(`No upcoming event matches that team. Provider lists ${upcoming.length} upcoming event(s); nearest: ${examples}`);
  }
  if (matches[1] && Date.parse(matches[1].commence_time) - Date.parse(matches[0].commence_time) < 10 * 60 * 60_000)
    throw new Error('Multiple near-term games match; enter the opponent name if it identifies one game');
  return matches[0];
}

async function currentMarket({ root, apiKey, sport, team, player, stat, side, line,
  fetchImpl = fetch, now = new Date() }) {
  sport = String(sport || '').toUpperCase();
  const market = MARKET_BY_STAT[sport]?.[stat];
  if (!market || !['over', 'under'].includes(side) ||
      (line !== null && line !== undefined && (!Number.isFinite(line) || line < 0)) ||
      String(player || '').trim().length < 3) throw new Error('Unsupported market query');
  const options = { apiKey, fetchImpl };
  const schedule = await events(sport, options); // provider says this endpoint is quota-free
  const event = selectEvent(schedule.data, team, now.valueOf());
  const odds = await withOddsBudget({ root, apiKey, fetchImpl, now, operation: () =>
    eventAlternateOdds(sport, event.id, { ...options, market }) });
  const needle = playerNameKey(player);
  const playerOffers = odds.selections.filter(row => playerNameKey(row.player) === needle &&
    row.side === side && row.odds >= -400 &&
    Date.parse(row.updatedAt) <= now.valueOf() && now.valueOf() - Date.parse(row.updatedAt) <= 5 * 60_000)
    .sort((a, b) => b.odds - a.odds);
  // An omitted line opens a player board instead of forcing members to know
  // an exact alternate quote before they can browse. Keep a real quoted line.
  const selectedLine = line ?? playerOffers
    .slice().sort((a, b) => Math.abs(a.odds + 200) - Math.abs(b.odds + 200) ||
      a.line - b.line)[0]?.line;
  if (selectedLine === undefined) throw new Error('No fresh alternate offers for this player and side');
  const offers = playerOffers.filter(row => row.line === selectedLine);
  const bestOtherLines = new Map();
  for (const row of playerOffers) if (row.line !== selectedLine && !bestOtherLines.has(row.line))
    bestOtherLines.set(row.line, row);
  const otherLines = [...bestOtherLines.values()].slice(0, 5);
  return { sport, player, stat, side, line: selectedLine, market, event,
    fetchedAt: odds.fetchedAt, remainingCredits: odds.remainingCredits,
    offers: offers.slice(0, 5), otherLines };
}

module.exports = { MARKET_BY_STAT, selectEvent, currentMarket };
