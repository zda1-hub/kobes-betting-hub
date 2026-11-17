// Shared CFBD/CBBD free-key cache. All upstream calls happen here so the key
// never leaves Wrangler. A reservation is charged even if upstream fails.
const LIMIT = 900;
const ORIGINS = Object.freeze({
  cfb: 'https://api.collegefootballdata.com',
  cbb: 'https://api.collegebasketballdata.com'
});

export async function ensureCollegeTables(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS trends_college_usage (month TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS trends_college_games (
      sport TEXT NOT NULL, game_id TEXT NOT NULL, game_date TEXT NOT NULL,
      season INTEGER NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL,
      status TEXT NOT NULL, checked_at TEXT NOT NULL,
      PRIMARY KEY (sport, game_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS trends_college_logs (
      sport TEXT NOT NULL, game_id TEXT NOT NULL, player_id TEXT NOT NULL,
      player_name TEXT NOT NULL, team TEXT NOT NULL, opponent TEXT NOT NULL,
      location TEXT NOT NULL, game_date TEXT NOT NULL, season INTEGER NOT NULL,
      stats_json TEXT NOT NULL, source_url TEXT NOT NULL,
      PRIMARY KEY (sport, game_id, player_id))`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_trends_college_player ON trends_college_logs (sport, player_name, game_date DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS trends_college_refresh (
      sport TEXT NOT NULL, game_date TEXT NOT NULL, checked_at TEXT NOT NULL,
      PRIMARY KEY (sport, game_date))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS trends_college_refresh_attempt (
      sport TEXT NOT NULL, game_date TEXT NOT NULL, attempted_at TEXT NOT NULL,
      PRIMARY KEY (sport, game_date))`)
  ]);
}

export async function reserveCollegeCall(db, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  await db.prepare('INSERT OR IGNORE INTO trends_college_usage (month, calls) VALUES (?, 0)').bind(month).run();
  const result = await db.prepare('UPDATE trends_college_usage SET calls = calls + 1 WHERE month = ? AND calls < ?')
    .bind(month, LIMIT).run();
  if (result.meta?.changes !== 1) throw new Error('Shared college API budget reached 900 calls this month');
  const row = await db.prepare('SELECT calls FROM trends_college_usage WHERE month = ?').bind(month).first();
  return { month, calls: row.calls, remainingBeforeGuard: LIMIT - row.calls };
}

async function collegeGet(env, sport, endpoint, now, fetchImpl = fetch) {
  if (!env.CFBD_API_KEY) throw new Error('CFBD_API_KEY is missing from Wrangler secrets');
  await reserveCollegeCall(env.DB, now);
  const url = `${ORIGINS[sport]}${endpoint}`;
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${env.CFBD_API_KEY}`, accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${sport.toUpperCase()} data endpoint returned ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${sport.toUpperCase()} data endpoint returned an unexpected shape`);
  return { data, url };
}

function number(value) { return value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null; }
function finalGame(game) {
  const status = String(game.status || '').toLowerCase();
  return game.completed === true || ['final', 'completed'].includes(status);
}
function pacificDate(instant) {
  const time = Date.parse(instant);
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
}
function gameDate(game) { return pacificDate(game.start_date || game.startDate); }

export function normalizeCbb(game, box) {
  if (!finalGame(game) || String(game.id) !== String(box.gameId)) return [];
  const team = String(box.team || '');
  const home = String(game.homeTeam || '');
  const away = String(game.awayTeam || '');
  if (team !== home && team !== away) return [];
  const opponent = team === home ? away : home;
  return (box.players || []).flatMap(player => {
    const pts = number(player.points), reb = number(player.rebounds?.total);
    const ast = number(player.assists), threes = number(player.threePointFieldGoals?.made);
    if (!player.athleteId || !player.name || [pts, reb, ast, threes].some(v => v === null) ||
        number(player.minutes) === null || number(player.minutes) <= 0) return [];
    return [{ playerId: String(player.athleteId), playerName: player.name, team,
      opponent, location: team === home ? 'home' : 'away',
      stats: { points: pts, rebounds: reb, assists: ast, threes,
        pra: pts + reb + ast, points_rebounds: pts + reb,
        points_assists: pts + ast, rebounds_assists: reb + ast } }];
  });
}

const CFB_NAMES = Object.freeze({
  'passing:yds': 'passing_yards', 'rushing:yds': 'rushing_yards',
  'receiving:yds': 'receiving_yards', 'receiving:rec': 'receptions',
  'receiving:receptions': 'receptions', 'rushing:td': 'rushing_tds',
  'receiving:td': 'receiving_tds'
});

export function normalizeCfb(game, box) {
  if (!finalGame(game) || String(game.id) !== String(box.id)) return [];
  const home = String(game.home_team || game.homeTeam || '');
  const away = String(game.away_team || game.awayTeam || '');
  const players = new Map();
  for (const teamRow of box.teams || []) {
    const team = String(teamRow.team || '');
    if (team !== home && team !== away) continue;
    for (const category of teamRow.categories || []) for (const type of category.types || []) {
      const metric = CFB_NAMES[`${String(category.name || '').trim().toLowerCase()}:${String(type.name || '').trim().toLowerCase()}`];
      if (!metric) continue;
      for (const athlete of type.athletes || []) {
        const value = number(athlete.stat);
        // CFBD includes synthetic team-total athletes with negative IDs and
        // names such as " Team". They are not searchable players.
        if (!Number.isSafeInteger(Number(athlete.id)) || Number(athlete.id) <= 0 ||
            !String(athlete.name || '').trim() ||
            String(athlete.name).trim().toLowerCase() === 'team' || value === null) continue;
        const id = String(athlete.id);
        const row = players.get(id) || { playerId: id, playerName: athlete.name, team,
          opponent: team === home ? away : home, location: team === home ? 'home' : 'away', stats: {} };
        if (row.team !== team) throw new Error('Conflicting college player team in box score');
        row.stats[metric] = value;
        players.set(id, row);
      }
    }
  }
  return [...players.values()].map(row => {
    const { rushing_yards: rush, receiving_yards: rec, rushing_tds: rushTd, receiving_tds: recTd } = row.stats;
    if (Number.isFinite(rush) && Number.isFinite(rec)) row.stats.rush_receiving_yards = rush + rec;
    if (Number.isFinite(rushTd) && Number.isFinite(recTd)) row.stats.anytime_touchdown = rushTd + recTd;
    return row;
  });
}

export async function refreshCollegeDay(env, sport, date, { now = new Date(), fetchImpl = fetch } = {}) {
  if (!ORIGINS[sport] || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Valid college sport and date required');
  if (date >= pacificDate(now.toISOString())) throw new Error('Only finished prior dates may be cached');
  if (!env.CFBD_API_KEY) throw new Error('CFBD_API_KEY is missing from Wrangler secrets');
  await ensureCollegeTables(env.DB);
  const done = await env.DB.prepare('SELECT checked_at FROM trends_college_refresh WHERE sport = ? AND game_date = ?')
    .bind(sport, date).first();
  if (done) return { sport, date, cached: true, checkedAt: done.checked_at };
  const start = `${date}T00:00:00Z`;
  const end = new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86400_000).toISOString();
  let schedules, boxes;
  if (sport === 'cbb') {
    const query = new URLSearchParams({ startDateRange: start, endDateRange: end });
    schedules = await collegeGet(env, sport, `/games?${query}`, now, fetchImpl);
    boxes = await collegeGet(env, sport, `/games/players?${query}`, now, fetchImpl);
  } else {
    // Fetch a whole week at a time. One request per game would exhaust the
    // shared free quota on a full college-football Saturday.
    schedules = await collegeGet(env, sport, `/games?year=${date.slice(0, 4)}`, now, fetchImpl);
    boxes = { data: [], url: `${ORIGINS.cfb}/games/players` };
    const targetGames = schedules.data.filter(g => finalGame(g) && gameDate(g) === date &&
      String(g.seasonType || g.season_type || 'regular').toLowerCase() === 'regular');
    const weeks = new Set(targetGames.map(g => Number(g.week)));
    if (weeks.has(NaN) || [...weeks].some(week => !Number.isInteger(week) || week < 0))
      throw new Error('CFB schedule is missing week numbers');
    for (const week of weeks) {
      const query = new URLSearchParams({ year: date.slice(0, 4), week: String(week), seasonType: 'regular' });
      const one = await collegeGet(env, sport, `/games/players?${query}`, now, fetchImpl);
      boxes.data.push(...one.data);
    }
  }
  const finalGames = schedules.data.filter(g => finalGame(g) && gameDate(g) === date &&
    String(g.seasonType || g.season_type || 'regular').toLowerCase() === 'regular');
  const gameById = new Map(finalGames.map(g => [String(g.id), g]));
  let saved = 0;
  const statements = [];
  for (const box of boxes.data) {
    const game = gameById.get(String(sport === 'cfb' ? box.id : box.gameId));
    if (!game) continue;
    const gameId = String(game.id);
    const rows = sport === 'cfb' ? normalizeCfb(game, box) : normalizeCbb(game, box);
    const sourceUrl = `${ORIGINS[sport]}/games/players`;
    for (const row of rows) {
      statements.push(env.DB.prepare(`INSERT OR REPLACE INTO trends_college_logs
        (sport, game_id, player_id, player_name, team, opponent, location, game_date, season, stats_json, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(sport, gameId, row.playerId, row.playerName, row.team, row.opponent,
          row.location, date, Number(game.season || date.slice(0, 4)), JSON.stringify(row.stats), sourceUrl));
      saved++;
    }
    statements.push(env.DB.prepare(`INSERT OR REPLACE INTO trends_college_games
      (sport, game_id, game_date, season, home_team, away_team, status, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, 'final', ?)`)
      .bind(sport, gameId, date, Number(game.season || date.slice(0, 4)),
        String(game.home_team || game.homeTeam), String(game.away_team || game.awayTeam), now.toISOString()));
  }
  // A day with final games but missing player rows must be retried, not marked complete.
  if (finalGames.length && !saved) throw new Error('Final college games returned no usable player rows');
  // D1.batch keeps a full slate below the Worker subrequest limit. Individual
  // row .run() calls exhausted that limit after only part of one CBB day.
  for (let offset = 0; offset < statements.length; offset += 100)
    await env.DB.batch(statements.slice(offset, offset + 100));
  await env.DB.prepare('INSERT INTO trends_college_refresh (sport, game_date, checked_at) VALUES (?, ?, ?)')
    .bind(sport, date, now.toISOString()).run();
  return { sport, date, games: finalGames.length, playerRows: saved, checkedAt: now.toISOString() };
}

export async function collegeStatus(env, now = new Date()) {
  await ensureCollegeTables(env.DB);
  const month = now.toISOString().slice(0, 7);
  const row = await env.DB.prepare('SELECT calls FROM trends_college_usage WHERE month = ?').bind(month).first();
  return { month, calls: row?.calls || 0, guard: LIMIT, keyConfigured: Boolean(env.CFBD_API_KEY) };
}

export async function collegeLogs(env, sport, player) {
  if (!ORIGINS[sport] || !player || String(player).length > 100) throw new Error('Valid sport and player required');
  await ensureCollegeTables(env.DB);
  const { results } = await env.DB.prepare(`SELECT game_id, player_id, player_name, team, opponent,
    location, game_date, season, stats_json, source_url FROM trends_college_logs
    WHERE sport = ? AND (player_id = ? OR lower(player_name) = lower(?)) ORDER BY game_date DESC LIMIT 80`)
    .bind(sport, String(player), String(player)).all();
  return results.map(row => ({ gameId: row.game_id, playerId: row.player_id,
    player: row.player_name, team: row.team, opponent: row.opponent, location: row.location,
    date: row.game_date, season: String(row.season), stats: expandedStats(sport, row.stats_json),
    status: 'final', participated: true, sourceUrl: row.source_url }));
}

export async function collegeTeamLogs(env, sport, team) {
  if (!ORIGINS[sport] || !team || String(team).length > 100)
    throw new Error('Valid sport and team required');
  await ensureCollegeTables(env.DB);
  const { results } = await env.DB.prepare(`SELECT game_id, player_id, player_name, team, opponent,
    location, game_date, season, stats_json, source_url FROM trends_college_logs
    WHERE sport = ? AND lower(team) = lower(?)
      AND season = (SELECT MAX(season) FROM trends_college_logs WHERE sport = ?)
    ORDER BY game_date DESC LIMIT 2000`)
    .bind(sport, String(team), sport).all();
  return results.map(row => ({ gameId: row.game_id, playerId: row.player_id,
    player: row.player_name, team: row.team, opponent: row.opponent,
    location: row.location, date: row.game_date, season: String(row.season),
    stats: expandedStats(sport, row.stats_json), status: 'final', participated: true,
    sourceUrl: row.source_url }));
}

function expandedStats(sport, raw) {
  const stats = JSON.parse(raw);
  if (sport === 'cbb') {
    const { points: pts, rebounds: reb, assists: ast } = stats;
    if ([pts, reb, ast].every(Number.isFinite)) {
      stats.points_rebounds = pts + reb;
      stats.points_assists = pts + ast;
      stats.rebounds_assists = reb + ast;
    }
  }
  return stats;
}

export async function collegeTeams(env, sport) {
  if (!ORIGINS[sport]) throw new Error('Valid college sport required');
  await ensureCollegeTables(env.DB);
  const { results } = await env.DB.prepare(`SELECT team, COUNT(DISTINCT game_id) AS games,
    MAX(game_date) AS last_game FROM trends_college_logs WHERE sport = ?
      AND season = (SELECT MAX(season) FROM trends_college_logs WHERE sport = ?)
    GROUP BY team ORDER BY team LIMIT 1000`).bind(sport, sport).all();
  return results.map(row => ({ team: row.team, games: row.games, lastGame: row.last_game }));
}

export function dueCollegeRefresh(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23'
  }).formatToParts(now);
  const part = name => Number(parts.find(row => row.type === name)?.value);
  const month = part('month');
  const hour = part('hour');
  // The five-minute publisher cron may run many times. refreshCollegeDay's
  // D1 receipt makes each finished date idempotent after the morning window.
  if (hour < 8) return null;
  const today = `${part('year')}-${String(month).padStart(2, '0')}-${String(part('day')).padStart(2, '0')}`;
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.parse(`${today}T12:00:00Z`) - 86400_000));
  return { date: yesterday, sports: [
    ...(month >= 8 || month <= 1 ? ['cfb'] : []),
    ...(month >= 11 || month <= 4 ? ['cbb'] : [])
  ] };
}

export async function refreshDueCollege(env, now = new Date(), { fetchImpl = fetch } = {}) {
  if (!env.CFBD_API_KEY) return { status: 'key_missing', refreshed: [] };
  const due = dueCollegeRefresh(now);
  if (!due || !due.sports.length) return { status: 'not_due', refreshed: [] };
  await ensureCollegeTables(env.DB);
  const refreshed = [];
  // Sequential requests preserve the shared monthly budget and avoid a burst
  // of upstream calls when both college sports have just played.
  for (const sport of due.sports) {
    const prior = await env.DB.prepare('SELECT attempted_at FROM trends_college_refresh_attempt WHERE sport = ? AND game_date = ?')
      .bind(sport, due.date).first();
    if (prior && now.valueOf() - Date.parse(prior.attempted_at) < 4 * 3600_000) {
      refreshed.push({ sport, date: due.date, cached: true, throttled: true });
      continue;
    }
    await env.DB.prepare('INSERT OR REPLACE INTO trends_college_refresh_attempt (sport, game_date, attempted_at) VALUES (?, ?, ?)')
      .bind(sport, due.date, now.toISOString()).run();
    try { refreshed.push(await refreshCollegeDay(env, sport, due.date, { now, fetchImpl })); }
    catch (error) { refreshed.push({ sport, date: due.date, error: error.message }); }
  }
  return { status: refreshed.some(row => row.error) ? 'held' : 'refreshed', refreshed };
}
