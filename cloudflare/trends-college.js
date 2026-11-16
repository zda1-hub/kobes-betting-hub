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
  if (!finalGame(game) || String(game.id) !== String(box.game_id)) return [];
  const team = String(box.team || '');
  const home = String(game.home_team || game.homeTeam || '');
  const away = String(game.away_team || game.awayTeam || '');
  if (team !== home && team !== away) return [];
  const opponent = team === home ? away : home;
  return (box.players || []).flatMap(player => {
    const pts = number(player.points), reb = number(player.rebounds?.total);
    const ast = number(player.assists), threes = number(player.three_point_field_goals?.made);
    if (!player.athlete_id || !player.name || [pts, reb, ast, threes].some(v => v === null) ||
        number(player.minutes) === null || number(player.minutes) <= 0) return [];
    return [{ playerId: String(player.athlete_id), playerName: player.name, team,
      opponent, location: team === home ? 'home' : 'away',
      stats: { points: pts, rebounds: reb, assists: ast, threes, pra: pts + reb + ast } }];
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
        if (!athlete.id || !athlete.name || value === null) continue;
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
    // CFB's player endpoint accepts a game ID. Fetch only final games from a
    // yearly schedule, then cache each completed box score once.
    schedules = await collegeGet(env, sport, `/games?year=${date.slice(0, 4)}`, now, fetchImpl);
    boxes = { data: [], url: `${ORIGINS.cfb}/games/players` };
    for (const game of schedules.data.filter(g => finalGame(g) && gameDate(g) === date)) {
      const found = await env.DB.prepare('SELECT 1 FROM trends_college_games WHERE sport = ? AND game_id = ? AND status = ?')
        .bind(sport, String(game.id), 'final').first();
      if (!found) {
        const one = await collegeGet(env, sport, `/games/players?id=${encodeURIComponent(game.id)}`, now, fetchImpl);
        boxes.data.push(...one.data);
      }
    }
  }
  const finalGames = schedules.data.filter(g => finalGame(g) && gameDate(g) === date);
  const gameById = new Map(finalGames.map(g => [String(g.id), g]));
  let saved = 0;
  for (const box of boxes.data) {
    const game = gameById.get(String(sport === 'cfb' ? box.id : box.game_id));
    if (!game) continue;
    const gameId = String(game.id);
    const rows = sport === 'cfb' ? normalizeCfb(game, box) : normalizeCbb(game, box);
    const sourceUrl = `${ORIGINS[sport]}/games/players`;
    for (const row of rows) {
      await env.DB.prepare(`INSERT OR REPLACE INTO trends_college_logs
        (sport, game_id, player_id, player_name, team, opponent, location, game_date, season, stats_json, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(sport, gameId, row.playerId, row.playerName, row.team, row.opponent,
          row.location, date, Number(game.season || date.slice(0, 4)), JSON.stringify(row.stats), sourceUrl).run();
      saved++;
    }
    await env.DB.prepare(`INSERT OR REPLACE INTO trends_college_games
      (sport, game_id, game_date, season, home_team, away_team, status, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, 'final', ?)`)
      .bind(sport, gameId, date, Number(game.season || date.slice(0, 4)),
        String(game.home_team || game.homeTeam), String(game.away_team || game.awayTeam), now.toISOString()).run();
  }
  // A day with final games but missing player rows must be retried, not marked complete.
  if (finalGames.length && !saved) throw new Error('Final college games returned no usable player rows');
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
    date: row.game_date, season: String(row.season), stats: JSON.parse(row.stats_json),
    status: 'final', participated: true, sourceUrl: row.source_url }));
}
