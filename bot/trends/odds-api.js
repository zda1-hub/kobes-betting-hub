'use strict';

// Read-only current odds. The key is sent in a header so it never enters URLs or logs.
// Additional player markets are event-scoped in The Odds API v4.
const ORIGIN = 'https://api.the-odds-api.com';
const SPORT_KEYS = Object.freeze({
  NBA: 'basketball_nba', NFL: 'americanfootball_nfl',
  MLB: 'baseball_mlb', NHL: 'icehockey_nhl'
});
const ALT_MARKETS = Object.freeze({
  NBA: ['player_points_alternate', 'player_rebounds_alternate', 'player_assists_alternate',
    'player_threes_alternate', 'player_points_rebounds_assists_alternate',
    'player_points_rebounds_alternate', 'player_points_assists_alternate',
    'player_rebounds_assists_alternate'],
  NFL: ['player_receptions_alternate', 'player_reception_yds_alternate', 'player_rush_yds_alternate',
    'player_pass_yds_alternate', 'player_rush_reception_yds_alternate', 'player_anytime_td'],
  MLB: ['batter_hits_alternate', 'pitcher_strikeouts_alternate'],
  NHL: ['player_shots_on_goal_alternate', 'player_points_alternate']
});

function sportKey(sport) {
  if (!Object.hasOwn(SPORT_KEYS, sport)) throw new Error(`Unsupported odds sport: ${sport}`);
  return SPORT_KEYS[sport];
}

async function request(path, { apiKey, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!apiKey) throw new Error('ODDS_API_KEY is required');
  const response = await fetchImpl(`${ORIGIN}${path}`, {
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`The Odds API request failed (${response.status})`);
  const data = await response.json();
  const remaining = response.headers.get('x-requests-remaining');
  return { data, fetchedAt: now().toISOString(), remainingCredits: remaining === null ? null : Number(remaining) };
}

function quotaStatus(options) {
  return request('/v4/sports/', options);
}

function events(sport, options) {
  return request(`/v4/sports/${sportKey(sport)}/events`, options);
}

async function eventAlternateOdds(sport, eventId, options = {}) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(eventId)) throw new Error('Invalid event ID');
  const markets = options.market ? [options.market] : ALT_MARKETS[sport];
  if (!markets) throw new Error(`Unsupported alternate markets: ${sport}`);
  if (markets.some(market => !ALT_MARKETS[sport]?.includes(market))) throw new Error('Unsupported alternate market');
  const params = new URLSearchParams({ regions: 'us', oddsFormat: 'american', markets: markets.join(',') });
  const result = await request(`/v4/sports/${sportKey(sport)}/events/${eventId}/odds?${params}`, options);
  return { ...result, selections: normalizeSelections(result.data, sport) };
}

function normalizeSelections(event, sport) {
  if (!event || !Array.isArray(event.bookmakers)) return [];
  const selections = [];
  for (const book of event.bookmakers) for (const market of book.markets || []) {
    if (!ALT_MARKETS[sport]?.includes(market.key)) continue;
    for (const outcome of market.outcomes || []) {
      const side = String(outcome.name).toLowerCase();
      const anytime = market.key === 'player_anytime_td' && side === 'yes';
      if ((!['over', 'under'].includes(side) && !anytime) || !outcome.description ||
        (!Number.isFinite(outcome.point) && !anytime)
        || !Number.isInteger(outcome.price) || Math.abs(outcome.price) < 100) continue;
      selections.push({
        sport, eventId: event.id, startsAt: event.commence_time,
        homeTeam: event.home_team, awayTeam: event.away_team,
        player: outcome.description, market: market.key, side: anytime ? 'over' : side,
        line: anytime ? 0.5 : outcome.point,
        odds: outcome.price, sportsbook: book.title || book.key,
        sportsbookKey: book.key, updatedAt: market.last_update || book.last_update,
        source: 'The Odds API', available: true
      });
    }
  }
  return selections;
}

module.exports = { SPORT_KEYS, ALT_MARKETS, quotaStatus, events, eventAlternateOdds, normalizeSelections };
