// Optional BALLDONTLIE leagues. This module never starts a timer or calls the
// provider on import. Each league requires its own explicit flag and secret.
const LEAGUES = Object.freeze({
  nhl: { flag: 'TRENDS_BDL_NHL_ENABLED', secret: 'BDL_NHL_API_KEY', prefix: '/nhl/v1',
    routes: { schedule: 'games', players: 'players', gameStats: 'box_scores', injuries: 'player_injuries' } },
  mlb: { flag: 'TRENDS_BDL_MLB_ENABLED', secret: 'BDL_MLB_API_KEY', prefix: '/mlb/v1',
    routes: { schedule: 'games', players: 'players', gameStats: 'stats', injuries: 'player_injuries' } },
  epl: { flag: 'TRENDS_BDL_EPL_ENABLED', secret: 'BDL_EPL_API_KEY', prefix: '/epl/v2',
    routes: { schedule: 'matches', players: 'players', gameStats: 'player_match_stats', injuries: 'player_injuries' } },
  mls: { flag: 'TRENDS_BDL_MLS_ENABLED', secret: 'BDL_MLS_API_KEY', prefix: '/mls/v1',
    routes: { schedule: 'matches', players: 'players', gameStats: 'player_match_stats', injuries: 'player_injuries' } },
  ucl: { flag: 'TRENDS_BDL_UCL_ENABLED', secret: 'BDL_UCL_API_KEY', prefix: '/ucl/v1',
    routes: { schedule: 'matches', players: 'players', gameStats: 'player_match_stats', injuries: 'player_injuries' } },
});

const QUERY_KEYS = new Set(['dates[]', 'season', 'team_ids[]', 'player_ids[]',
  'game_ids[]', 'match_ids[]', 'match_id', 'search', 'per_page', 'cursor']);

function createOptionalBdlProvider(sport, { env, fetchImpl = fetch } = {}) {
  const league = LEAGUES[sport];
  if (!league) throw new Error('Unsupported optional BALLDONTLIE league');
  if (!env) throw new Error('Worker environment required');
  const status = () => ({ sport, enabled: env[league.flag] === 'true',
    keyConfigured: Boolean(env[league.secret]) });
  async function read(resource, query = {}) {
    // The flag check must precede query handling and any network activity.
    if (env[league.flag] !== 'true') throw new Error(`${sport.toUpperCase()} provider disabled`);
    const key = env[league.secret];
    if (!key) throw new Error(`${sport.toUpperCase()} provider key missing`);
    const route = league.routes[resource];
    if (!route) throw new Error('Unsupported provider resource');
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (!QUERY_KEYS.has(name) || value === undefined || value === null)
        throw new Error('Unsupported provider query');
      for (const item of Array.isArray(value) ? value : [value]) {
        const text = String(item);
        if (!text || text.length > 100) throw new Error('Invalid provider query value');
        params.append(name, text);
      }
    }
    if (Number(params.get('per_page') || 25) > 100) throw new Error('Provider page too large');
    if (resource === 'schedule' && !params.has('dates[]'))
      throw new Error('Schedule date required');
    if (resource === 'gameStats' && !['game_ids[]', 'match_ids[]', 'match_id',
      'player_ids[]', 'dates[]'].some(name => params.has(name)))
      throw new Error('Game or player filter required');
    const response = await fetchImpl(`https://api.balldontlie.io${league.prefix}/${route}?${params}`, {
      headers: { Authorization: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    if (!response.ok) throw new Error(`${sport.toUpperCase()} provider returned ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error('Provider response shape changed');
    return body;
  }
  return { sport, status, read };
}

export { LEAGUES, createOptionalBdlProvider };
