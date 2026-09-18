const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const { auditedFetch } = require('../../pipeline/api-client');
const { specialMarketGrade, number: verifiedNumber } = require('./espn-special-markets');
const { matchTennisCompetition, gradeTennisMatch } = require('./espn-tennis-grading');
const { normalizeSelection, combinationSelections, playerNameMatches } = require('./wager-terms');
const { reviewedAdjudication } = require('./verified-adjudications');

const LEAGUES = {
  mlb: { path: 'baseball/mlb', url: 'https://www.espn.com/mlb/game/_/gameId/' },
  nfl: { path: 'football/nfl', url: 'https://www.espn.com/nfl/game/_/gameId/' },
  ncaaf: { path: 'football/college-football', url: 'https://www.espn.com/college-football/game/_/gameId/' },
  nba: { path: 'basketball/nba', url: 'https://www.espn.com/nba/game/_/gameId/' },
  wnba: { path: 'basketball/wnba', url: 'https://www.espn.com/wnba/game/_/gameId/' },
  ncaab: { path: 'basketball/mens-college-basketball', url: 'https://www.espn.com/mens-college-basketball/game/_/gameId/' },
  epl: { path: 'soccer/eng.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  mls: { path: 'soccer/usa.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  laliga: { path: 'soccer/esp.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  seriea: { path: 'soccer/ita.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  bundesliga: { path: 'soccer/ger.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  ligue1: { path: 'soccer/fra.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  eredivisie: { path: 'soccer/ned.1', url: 'https://www.espn.com/soccer/match/_/gameId/' },
  ucl: { path: 'soccer/uefa.champions', url: 'https://www.espn.com/soccer/match/_/gameId/' }
};

function compact(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function leagueFor(row) {
  if (row.league_from_group) return null;
  const value = `${row.league || ''} ${row.sport || ''}`.toLowerCase();
  if (/\bmlb\b|baseball/.test(value)) return LEAGUES.mlb;
  if (/\bncaaf\b|\bcfb\b|college football/.test(value)) return LEAGUES.ncaaf;
  if (/\bnfl\b|football/.test(value)) return LEAGUES.nfl;
  if (/\bwnba\b/.test(value)) return LEAGUES.wnba;
  if (/\bncaab\b|college basketball/.test(value)) return LEAGUES.ncaab;
  if (/\bnba\b/.test(value)) return LEAGUES.nba;
  for (const [pattern, key] of [[/\bepl\b|premier league/, 'epl'], [/\bmls\b/, 'mls'], [/la liga|laliga/, 'laliga'], [/serie a|seriea/, 'seriea'], [/bundesliga/, 'bundesliga'], [/ligue 1|ligue1/, 'ligue1'], [/eredivisie/, 'eredivisie'], [/\bucl\b|champions league/, 'ucl']]) if (pattern.test(value)) return LEAGUES[key];
  return null;
}

function eventDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date.replaceAll('-', '') : '';
}

function matchingEvent(row, events) {
  const sourceEvent = compact(row.event);
  if (!sourceEvent) return null;
  const matches = (events || []).filter((event) => {
    const competitors = event.competitions?.[0]?.competitors || [];
    // Multiple aliases of one team do not identify both sides of a matchup.
    return competitors.length === 2 && competitors.every((competitor) => [
      competitor.team?.displayName, competitor.team?.shortDisplayName, competitor.team?.abbreviation, competitor.team?.name
    ].map(compact).filter((name) => name.length >= 3).some((name) => sourceEvent.includes(name)));
  });
  // Doubleheaders or duplicate event matches need an explicit event identity.
  return matches.length === 1 ? matches[0] : null;
}

function completed(summary, event) {
  const status = summary.header?.competitions?.[0]?.status?.type;
  return status ? status.completed === true && !/cancel|postpon|suspend|abandon/i.test(`${status.name || ''} ${status.description || ''}`)
    : event.status?.type?.completed === true;
}

function directionAndLine(row) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`;
  const milestone = text.match(/(?:^|\s)(\d+)\+\s+(?:passing|rushing|receiving|longest|yards|points|hits|strikeouts|receptions)/i);
  if (milestone) return { direction: 'OVER', line: Number(milestone[1]) - 0.5 };
  const direction = text.match(/\b(over|under)\b/i)?.[1]?.toUpperCase() || '';
  const line = Number(text.match(/\b(?:over|under)\s*(\d+(?:\.\d+)?)/i)?.[1]
    || String(row.published_line || '').match(/-?\d+(?:\.\d+)?/)?.[0]);
  return direction && Number.isFinite(line) ? { direction, line } : null;
}

function compare(actual, { direction, line }) {
  if (actual === line) return 'P';
  if (direction === 'OVER') return actual > line ? 'W' : 'L';
  return actual < line ? 'W' : 'L';
}

function athleteEntries(summary) {
  return (summary.boxscore?.players || []).flatMap((team) => (team.statistics || []).flatMap((group) =>
    (group.athletes || []).map((athlete) => ({
      name: athlete.athlete?.displayName || '',
      athleteId: athlete.athlete?.id || '',
      category: group.type || group.name || group.displayName || '',
      values: Object.fromEntries((group.keys || []).map((key, index) => [key, athlete.stats?.[index]]))
    }))
  ));
}

function selectedPlayerPrefix(row) {
  return String(row.selection || '').split(/\b(?:over|under|longest|anytime|first TD|1st TD|first touchdown|passing|rushing|receiving|pass attempts|pass completions|carries|receptions|targets|field goals)\b|\s\d+(?:\.\d+)?\+/i)[0].trim();
}
function selectedPlayerName(row) {
  return compact(selectedPlayerPrefix(row));
}

function statSpec(row, entries) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`.toLowerCase();
  const names = new Set(entries.filter(entry => selectedPlayerName(row) === compact(entry.name) && compact(entry.name).length >= 5).map(entry => compact(entry.name)));
  if (names.size !== 1) return null;
  const player = entries.find(entry => names.has(compact(entry.name)));
  if (!player) return null;
  const pick = (category, key, label, transform = Number) => ({ player, category, key, label, transform });
  if (/hits\s*\+\s*runs\s*\+\s*(?:RBIs?|runs batted in)/i.test(text)) return { ...pick('batting', ['hits', 'runs', 'RBIs'], 'hits + runs + RBIs'), sum: true };
  if (/\bouts?\b|innings pitched/.test(text)) return pick('pitching', 'fullInnings.partInnings', 'outs', inningsToOuts);
  if (/walks? allowed/.test(text)) return pick('pitching', 'walks', 'walks allowed');
  if (/earned runs?/.test(text)) return pick('pitching', 'earnedRuns', 'earned runs');
  if (/hits? allowed/.test(text)) return pick('pitching', 'hits', 'hits allowed');
  if (/strikeouts?|\bks\b/.test(text)) {
    const pitcher = entries.find((entry) => compact(entry.name) === compact(player.name) && entry.category === 'pitching');
    return pick(pitcher ? 'pitching' : 'batting', 'strikeouts', 'strikeouts');
  }
  if (/\brbis?\b|runs batted in/.test(text)) return pick('batting', 'RBIs', 'RBIs');
  if (/home runs?|\bhrs?\b/.test(text)) return pick('batting', 'homeRuns', 'home runs');
  if (/stolen bases?|\bsbs?\b/.test(text)) return pick('batting', 'stolenBases', 'stolen bases');
  if (/total bases?/.test(text)) return pick('batting', 'totalBases', 'total bases');
  if (/\bhits?\b/.test(text)) return pick('batting', 'hits', 'hits');
  if (/\bruns?\b/.test(text)) return pick('batting', 'runs', 'runs');
  if (/passing yards?/.test(text)) return pick('passing', 'passingYards', 'passing yards');
  if (/pass(?:ing)? completions?/.test(text)) return pick('passing', ['completions', 'passingCompletions', 'completions/passingAttempts'], 'pass completions', value => Number(String(value).split('/')[0]));
  if (/pass(?:ing)? attempts?/.test(text)) return pick('passing', ['passingAttempts', 'attempts', 'completions/passingAttempts'], 'pass attempts', value => Number(String(value).split('/').at(-1)));
  if (/passing touchdowns?|pass tds?/.test(text)) return pick('passing', ['passingTouchdowns', 'passingTDs'], 'passing touchdowns');
  if (/interceptions? thrown/.test(text)) return pick('passing', ['interceptions', 'interceptionsThrown'], 'interceptions thrown');
  if (/longest pass|long pass/.test(text)) return pick('passing', ['longPassing', 'longestPass', 'long'], 'longest pass');
  if (/rushing touchdowns?|rush tds?/.test(text)) return pick('rushing', ['rushingTouchdowns', 'rushingTDs'], 'rushing touchdowns');
  if (/rushing attempts?|carries/.test(text)) return pick('rushing', ['rushingAttempts', 'attempts', 'carries'], 'rushing attempts');
  if (/longest rush|long rush/.test(text)) return pick('rushing', ['longRushing', 'longestRush', 'long'], 'longest rush');
  if (/rushing yards?/.test(text)) return pick('rushing', 'rushingYards', 'rushing yards');
  if (/longest reception|long reception|longest catch|long catch/.test(text)) {
    return pick('receiving', ['longestReception', 'longReception', 'long'], 'longest reception');
  }
  if (/receiving yards?/.test(text)) return pick('receiving', 'receivingYards', 'receiving yards');
  if (/receiving touchdowns?|receiving tds?/.test(text)) return pick('receiving', ['receivingTouchdowns', 'receivingTDs'], 'receiving touchdowns');
  if (/receiving targets?|\btargets?\b/.test(text)) return pick('receiving', ['receivingTargets', 'targets'], 'receiving targets');
  if (/receptions?/.test(text)) return pick('receiving', 'receptions', 'receptions');
  if (/field goals? made/.test(text)) return pick('kicking', 'fieldGoalsMade/fieldGoalAttempts', 'field goals made', value => Number(String(value).split('/')[0]));
  if (/\bpoints\b/.test(text)) return pick('basketball', 'points', 'points');
  if (/\brebounds\b/.test(text)) return pick('basketball', 'rebounds', 'rebounds');
  if (/\bassists\b/.test(text)) return pick('basketball', 'assists', 'assists');
  return null;
}

function statValue(entry, key) {
  const keys = Array.isArray(key) ? key : [key];
  for (const candidate of keys) {
    const raw = entry?.values?.[candidate];
    if (raw == null || String(raw).trim() === '' || raw === '--') continue;
    if (candidate.includes('/') && /^\d+\/\d+$/.test(String(raw))) return String(raw);
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function inningsToOuts(value) {
  const match = String(value || '').match(/^(\d+)(?:\.(\d))?$/);
  if (!match || Number(match[2] || 0) > 2) return NaN;
  return Number(match[1]) * 3 + Number(match[2] || 0);
}

function moneylineGrade(row, summary) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`.toLowerCase();
  if (!/\b(?:ml|moneyline)\b/.test(text)) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  const team = competitors.find((competitor) => {
    const names = [competitor.team?.displayName, competitor.team?.shortDisplayName, competitor.team?.abbreviation, competitor.team?.name]
      .map(compact).filter((name) => name.length >= 3);
    return names.some((name) => compact(row.selection).includes(name));
  });
  if (!team || typeof team.winner !== 'boolean') return null;
  const scores = competitors.map(c => verifiedNumber(c.score));
  if (scores.length === 2 && scores.every(Number.isFinite) && scores[0] === scores[1]) return null;
  return { result: team.winner ? 'W' : 'L', outcome: `${team.team?.displayName || 'Team'} ${team.score ?? ''}`.trim() };
}

function gameTotalGrade(row, summary) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`.toLowerCase();
  if (!/\b(?:full game|game|match) total\b/.test(text)) return null;
  const comparison = directionAndLine(row);
  if (!comparison) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  const scores = competitors.map((competitor) => verifiedNumber(competitor.score));
  if (scores.length !== 2 || scores.some((score) => !Number.isFinite(score))) return null;
  const actual = scores[0] + scores[1];
  return { result: compare(actual, comparison), outcome: `Final game total: ${actual}` };
}

function spreadGrade(row, summary) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`;
  if (!/\bspread\b/i.test(text)) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  const team = competitors.find((competitor) => {
    const names = [competitor.team?.displayName, competitor.team?.shortDisplayName, competitor.team?.abbreviation, competitor.team?.name]
      .map(compact).filter((name) => name.length >= 2);
    return names.some((name) => compact(row.selection).includes(name));
  });
  const opponent = competitors.find((competitor) => competitor !== team);
  const line = Number(`${row.selection || ''} ${row.published_line || ''}`.match(/(?:^|\s)([+-]\d+(?:\.\d+)?)(?=\s|$)/)?.[1]);
  const teamScore = verifiedNumber(team?.score);
  const opponentScore = verifiedNumber(opponent?.score);
  if (!team || !opponent || !Number.isFinite(line) || !Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) return null;
  const adjusted = teamScore + line;
  const result = adjusted === opponentScore ? 'P' : adjusted > opponentScore ? 'W' : 'L';
  return { result, outcome: `${team.team?.displayName || 'Team'} ${teamScore}, opponent ${opponentScore} (${line > 0 ? '+' : ''}${line})` };
}

async function getJson(url, fetchImpl) {
  const response = await auditedFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  }, {
    service: 'espn',
    callerComponent: 'bot/lib/espn-grading',
    triggerType: 'pick_grading'
  }, fetchImpl);
  if (!response.ok) throw new Error(`ESPN returned ${response.status}.`);
  return response.json();
}

async function resolveStraightWager(row, fetchImpl) {
  if (row.event) return null;
  const selection = String(row.selection || '').replace(/\b(?:F5|1H|2H|first half|second half|first five)\b/gi, '').replace(/\s+/g, ' ').trim();
  // A standalone team followed only by a signed three/four-digit price is
  // conventional moneyline shorthand, not a spread. Resolve the team uniquely
  // on the exact date before accepting it; never treat bare team names as ML.
  const moneyline = selection.match(/^(.+?)\s+(?:ML|moneyline)(?:\s|$)/i)
    || selection.match(/^([A-Za-z .'-]+)\s+[+-]\d{3,4}(?:\s*\(\d+(?:\.\d+)?\s*U\))?$/i);
  const spread = selection.match(/^(.+?)\s+([+-]\d{1,2}(?:\.\d+)?)(?=\s|$)/);
  const total = selection.match(/^(.+?)\s+(?:over|under)\s+\d+(?:\.\d+)?/i);
  const firstInning = selection.match(/^(.+?)\s+(?:NRFI|YRFI)\b/i);
  const btts = selection.match(/^(.+?)\s+BTTS\b/i);
  const prefix = (moneyline?.[1] || spread?.[1] || total?.[1] || firstInning?.[1] || btts?.[1])?.replace(/\s+team total\s*$/i, '');
  if (!prefix) return null;
  const names = prefix.split(/\s*(?:\/|\bvs\.?\b|\bat\b)\s*/i).map(compact);
  // A total requires both teams; a team-total or player prop is not a game total.
  const teamTotal = /\bteam total\b/i.test(selection);
  if (total && !moneyline && !spread && names.length !== (teamTotal ? 1 : 2)) return null;
  if ((!total || moneyline || spread) && !firstInning && !btts && names.length !== 1) return null;
  if (firstInning && names.length !== 2) return null;
  if (btts && names.length !== 2) return null;
  const known = leagueFor(row);
  const candidates = [];
  for (const league of known ? [known] : Object.values(LEAGUES)) {
    const scoreboard = await getJson(`${ESPN_BASE_URL}/${league.path}/scoreboard?dates=${eventDate(row.operating_date)}&limit=100`, fetchImpl);
    for (const event of scoreboard.events || []) {
      const competitors = event.competitions?.[0]?.competitors || [];
      if (competitors.length !== 2) continue;
      const aliases = competitors.map(c => [c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation, c.team?.name, league === LEAGUES.ncaaf ? c.team?.location : ''].map(compact).filter(Boolean));
      const matched = names.map(name => aliases.flatMap((values, index) => values.includes(name) ? [index] : []));
      if (!matched.every(indices => indices.length === 1) || new Set(matched.flat()).size !== names.length) continue;
      candidates.push({ league, event, market: moneyline ? 'Moneyline' : spread ? 'Spread' : firstInning ? 'First inning runs' : btts ? 'BTTS' : teamTotal ? 'Team total' : 'Full game total' });
    }
  }
  // Ambiguous names and doubleheaders remain pending; no arbitrary first match.
  return candidates.length === 1 ? candidates[0] : null;
}

async function resolvePlayerWager(row, fetchImpl) {
  if (row.event || !/\b(?:over|under|anytime|1st TD|first TD|first touchdown)\b|\s\d+\+\s/i.test(row.selection || '')) return null;
  const player = selectedPlayerName(row);
  if (player.length < 5 && !/^[A-Z]{3,4}$/.test(selectedPlayerPrefix(row))) return null;
  const known = leagueFor(row);
  const football = /passing|rushing|receiving|receptions?|carries|touchdown|\bTD\b|field goals|\bpass\b/i.test(row.selection);
  const baseball = /strikeout|\bKs\b|hits|total bases|RBIs|earned runs|outs/i.test(row.selection);
  const basketball = /points|rebounds|assists/i.test(row.selection);
  const leagues = known ? [known] : football ? [LEAGUES.nfl, LEAGUES.ncaaf] : baseball ? [LEAGUES.mlb] : basketball ? [LEAGUES.nba, LEAGUES.wnba, LEAGUES.ncaab] : [];
  const candidates = [];
  for (const league of leagues) {
    const scoreboard = await getJson(`${ESPN_BASE_URL}/${league.path}/scoreboard?dates=${eventDate(row.operating_date)}&limit=100`, fetchImpl);
    const events = scoreboard.events || [];
    // No partial scan: if a slate exceeds the safe limit, exact event identity is required.
    if (events.length > 40) return null;
    for (const event of events) {
      if (!event.id) continue;
      const summary = await getJson(`${ESPN_BASE_URL}/${league.path}/summary?event=${event.id}`, fetchImpl);
      const matches = [...new Set(athleteEntries(summary).filter(entry => playerNameMatches(selectedPlayerPrefix(row), entry.name)).map(entry => entry.name))];
      if (matches.length === 1) candidates.push({ league, event, summary, market: row.market, selection: row.selection.replace(selectedPlayerPrefix(row), matches[0]) });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function createGradingFetch(fetchImpl = fetch) {
  const responses = new Map();
  return async (url, options) => {
    const key = String(url);
    if (!responses.has(key)) responses.set(key, Promise.resolve(fetchImpl(url, options)).then(response => {
      if (!response.ok) responses.delete(key);
      return response;
    }).catch(error => { responses.delete(key); throw error; }));
    return (await responses.get(key)).clone();
  };
}

async function gradePickFromEspn(row, { fetchImpl = fetch, includeContext = false, parlayLeg = false } = {}) {
  const reviewed = reviewedAdjudication(row);
  if (reviewed) return reviewed;
  if (String(row.result || 'PENDING').toUpperCase() !== 'PENDING') return { status: 'SKIPPED', reason: 'Pick is already graded.' };
  row = { ...row, selection: normalizeSelection(row.selection) };
  // Split source publications are independent approval cards, not the original
  // source's parent parlay. A stale parent market must not swallow their result.
  if (/^\d{8}-\d+-\d+-X$/.test(row.pick_id || '') && /parlay/i.test(row.market || '') && combinationSelections(row.selection).length === 1) row.market = '';
  const terms = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`;
  const combinations = combinationSelections(row.selection);
  if (/\b(?:parlay|teaser)\b/i.test(terms) || combinations.length > 1) {
    if (parlayLeg) return { status: 'PENDING', reason: 'Nested combinations require the original sportsbook settlement.' };
    const teaser = /\bteaser\b/i.test(terms);
    // Explicitly stated adjusted teaser lines can be evaluated when neither leg
    // pushes/voids. Never apply the teaser adjustment a second time.
    const teaserParts = teaser && row.selection.match(/^(.+?[+-]\d+(?:\.\d+)?)\s+(over|under)\s+(\d+(?:\.\d+)?)(?:\.|\s|$)/i);
    const selections = teaserParts ? [teaserParts[1], `${teaserParts[2]} ${teaserParts[3]}`] : combinations.map(s => s.replace(/\s+\d+(?:\.\d+)?[- ]point\s+teaser.*$/i, '').trim());
    if (selections.length < 2 || selections.length > 12 || selections.some(s => !s.trim())) return { status: 'PENDING', reason: 'A parlay needs every original leg explicitly identified.' };
    const legs = [];
    let context;
    for (const selection of selections) {
      const totalOnly = /^\s*(?:over|under)\s+\d/i.test(selection);
      const firstLeg = legs.length === 0;
      const leg = await gradePickFromEspn({ ...row, selection: selection.trim(), published_line: '', market: totalOnly ? 'Full game total' : /(?:^|\s)[+-]\d{1,2}(?:\.\d+)?(?=\s|$)/.test(selection) ? 'Spread' : '', event: totalOnly ? context?.event || row.event : firstLeg ? row.event : '', league: totalOnly ? context?.league || row.league : firstLeg ? row.league : '', sport: totalOnly ? context?.league || row.sport : firstLeg ? row.sport : '', league_from_group: totalOnly && context?.league ? false : row.league_from_group }, { fetchImpl, includeContext: true, parlayLeg: true });
      if (leg.status !== 'GRADED') return { status: 'PENDING', reason: `Parlay leg ${legs.length + 1}: ${leg.reason}` };
      if (['P', 'V'].includes(leg.result)) return { status: 'PENDING', reason: 'A pushed/voided parlay leg changes the payout; original sportsbook settlement is required.' };
      legs.push(leg);
      context = leg.context || context;
    }
    return { status: 'GRADED', result: legs.every(l => l.result === 'W') ? 'W' : 'L', outcome: legs.map((l, i) => `Leg ${i + 1}: ${l.result} — ${l.outcome}`).join('; '), source: [...new Set(legs.map(l => l.source))].join(' | ') };
  }
  if (/\blookahead\b/i.test(terms)) {
    return { status: 'PENDING', reason: 'This combination, period, or special market needs a dedicated verified grader.' };
  }
  let league = leagueFor(row);
  const date = eventDate(row.operating_date);
  if (!date) return { status: 'PENDING', reason: 'Unsupported league or missing operating date.' };
  const tennis = /tennis|\batp\b|\bwta\b/i.test(`${row.league || ''} ${row.sport || ''}`);
  if (tennis) {
    try {
      const feeds = [];
      for (const tour of /\batp\b/i.test(row.league || '') ? ['atp'] : /\bwta\b/i.test(row.league || '') ? ['wta'] : ['atp', 'wta']) feeds.push({ tour, payload: await getJson(`${ESPN_BASE_URL}/tennis/${tour}/scoreboard?dates=${date}&limit=100`, fetchImpl) });
      return gradeTennisMatch(row, matchTennisCompetition(row, feeds));
    } catch (error) { return { status: 'PENDING', reason: error.message }; }
  }
  let resolved;
  try { resolved = await resolveStraightWager(row, fetchImpl) || await resolvePlayerWager(row, fetchImpl); }
  catch (error) { return { status: 'PENDING', reason: error.message }; }
  if (resolved) {
    league = resolved.league;
    row = { ...row, market: resolved.market, selection: resolved.selection || row.selection };
  }
  if (!league) {
    // Terms-only exclusive packets can omit a sport. A unique, date-filtered
    // singles result can identify tennis without guessing from the player name.
    try {
      const feeds = [];
      for (const tour of ['atp', 'wta']) feeds.push({ tour, payload: await getJson(`${ESPN_BASE_URL}/tennis/${tour}/scoreboard?dates=${date}&limit=100`, fetchImpl) });
      const match = matchTennisCompetition(row, feeds);
      if (match) return gradeTennisMatch(row, match);
    } catch (error) { return { status: 'PENDING', reason: error.message }; }
    return { status: 'PENDING', reason: 'Unsupported league or no unique same-day event identity.' };
  }
  let scoreboard;
  try {
    scoreboard = await getJson(`${ESPN_BASE_URL}/${league.path}/scoreboard?dates=${date}&limit=100`, fetchImpl);
  } catch (error) {
    return { status: 'PENDING', reason: error.message };
  }
  const event = resolved?.event || matchingEvent(row, scoreboard.events);
  if (!event?.id) return { status: 'PENDING', reason: 'No matching ESPN event was found.' };
  let summary;
  try {
    summary = resolved?.summary || await getJson(`${ESPN_BASE_URL}/${league.path}/summary?event=${event.id}`, fetchImpl);
  } catch (error) {
    return { status: 'PENDING', reason: error.message };
  }
  if (!completed(summary, event)) return { status: 'PENDING', reason: 'The ESPN event is not final.' };
  const summaryId = summary.header?.competitions?.[0]?.id;
  if (summaryId && String(summaryId) !== String(event.id)) return { status: 'PENDING', reason: 'The summary does not match the exact requested event ID.' };
  let source = `${league.url}${event.id}`;
  const finish = grade => ({ status: 'GRADED', ...grade, source, ...(includeContext ? { context: { league: Object.keys(LEAGUES).find(key => LEAGUES[key] === league), event: (event.competitions?.[0]?.competitors || []).map(c => c.team?.displayName).join(' at ') } } : {}) });
  if (league.path.startsWith('soccer/')) {
    const competition = summary.header?.competitions?.[0];
    const finalPeriod = competition?.status?.period ?? event.competitions?.[0]?.status?.period ?? event.status?.period;
    if (competition?.status?.type?.name !== 'STATUS_FULL_TIME' || finalPeriod !== 2) return { status: 'PENDING', reason: 'Soccer requires a verified 90-minute full-time result; extra-time/penalty rules cannot be assumed.' };
    if (/\bBTTS\b/i.test(terms)) {
      const scores = (competition.competitors || []).map(c => verifiedNumber(c.score));
      if (scores.length !== 2 || !scores.every(Number.isFinite)) return { status: 'PENDING', reason: 'Both final soccer goal totals are required.' };
      const both = scores.every(score => score > 0);
      return finish({ result: (/BTTS\s*(?:no|false)/i.test(terms) ? !both : both) ? 'W' : 'L', outcome: `90-minute BTTS: ${scores.join('–')}` });
    }
  }
  const special = specialMarketGrade(row, summary, league.path);
  if (special) return special.status === 'PENDING' ? special : finish(special);
  const moneyline = moneylineGrade(row, summary);
  if (moneyline) return finish(moneyline);
  const gameTotal = gameTotalGrade(row, summary);
  if (gameTotal) return finish(gameTotal);
  const spread = spreadGrade(row, summary);
  if (spread) return finish(spread);
  const comparison = directionAndLine(row);
  if (!comparison) return { status: 'PENDING', reason: 'No clear over/under line was found.' };
  const spec = statSpec(row, athleteEntries(summary));
  if (!spec) return { status: 'PENDING', reason: 'No supported, exact player-stat match was found.' };
  const entry = athleteEntries(summary).find((candidate) => compact(candidate.name) === compact(spec.player.name) && (candidate.category === spec.category || spec.category === 'basketball' && league.path.startsWith('basketball/')));
  const components = spec.sum ? spec.key.map(key => statValue(entry, key)) : [];
  let actual = spec.sum ? components.every(Number.isFinite) ? components.reduce((a,b)=>a+b,0) : NaN : spec.transform(statValue(entry, spec.key));
  if (!Number.isFinite(actual) && spec.player.athleteId && /^\d+$/.test(spec.player.athleteId)) {
    // ESPN omits zero-catch receivers from the receiving table. An explicit
    // zero in the exact athlete/event gamelog is evidence; a missing row is not.
    const participation = athleteEntries(summary).some(candidate => compact(candidate.name) === compact(spec.player.name)
      && Object.values(candidate.values).some(value => /^\d+(?:\.\d+)?(?:\/\d+)?$/.test(String(value)) && Number(String(value).split('/')[0]) > 0));
    if (participation) {
      const url = `https://site.web.api.espn.com/apis/common/v3/sports/${league.path}/athletes/${spec.player.athleteId}/gamelog?region=us&lang=en&contentorigin=espn&season=${row.operating_date.slice(0, 4)}`;
      try {
        const gamelog = await getJson(url, fetchImpl);
        const metadata = gamelog.events?.[event.id];
        const gameDate = metadata?.gameDate && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(metadata.gameDate));
        const records = (gamelog.seasonTypes || []).flatMap(season => (season.categories || []).flatMap(category => category.events || [])).filter(record => String(record.eventId) === String(event.id));
        if (gameDate === row.operating_date && records.length === 1) {
          const values = Object.fromEntries((gamelog.names || []).map((key, index) => [key, records[0].stats?.[index]]));
          if (spec.key === 'totalBases' && values.totalBases == null) {
            const counts = ['hits', 'doubles', 'triples', 'homeRuns'].map(key => verifiedNumber(values[key]));
            if (counts.every(Number.isFinite) && counts[1] + counts[2] + counts[3] <= counts[0]) values.totalBases = String(counts[0] + counts[1] + 2 * counts[2] + 3 * counts[3]);
          }
          const fallback = { values };
          const parts = spec.sum ? spec.key.map(key => statValue(fallback, key)) : [];
          const value = spec.sum ? parts.every(Number.isFinite) ? parts.reduce((a,b)=>a+b,0) : NaN : spec.transform(statValue(fallback, spec.key));
          if (Number.isFinite(value)) { actual = value; source += ` | ${url}`; }
        }
      } catch { /* Missing secondary evidence must remain pending, not zero. */ }
    }
  }
  if (!Number.isFinite(actual)) return { status: 'PENDING', reason: 'The final ESPN box score did not contain the required stat.' };
  return finish({
    result: compare(actual, comparison),
    outcome: `${spec.player.name}: ${actual} ${spec.label}`,
  });
}

module.exports = { createGradingFetch, gameTotalGrade, gradePickFromEspn, inningsToOuts, matchingEvent, spreadGrade, statSpec };
