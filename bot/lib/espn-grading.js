const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const { auditedFetch } = require('../../pipeline/api-client');

const LEAGUES = {
  mlb: { path: 'baseball/mlb', url: 'https://www.espn.com/mlb/game/_/gameId/' },
  nfl: { path: 'football/nfl', url: 'https://www.espn.com/nfl/game/_/gameId/' },
  ncaaf: { path: 'football/college-football', url: 'https://www.espn.com/college-football/game/_/gameId/' }
};

function compact(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function leagueFor(row) {
  const value = `${row.league || ''} ${row.sport || ''}`.toLowerCase();
  if (/\bmlb\b|baseball/.test(value)) return LEAGUES.mlb;
  if (/\bncaaf\b|college football/.test(value)) return LEAGUES.ncaaf;
  if (/\bnfl\b|football/.test(value)) return LEAGUES.nfl;
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
      competitor.team?.displayName, competitor.team?.shortDisplayName, competitor.team?.abbreviation
    ].map(compact).filter((name) => name.length >= 3).some((name) => sourceEvent.includes(name)));
  });
  // Doubleheaders or duplicate event matches need an explicit event identity.
  return matches.length === 1 ? matches[0] : null;
}

function completed(summary, event) {
  return summary.header?.competitions?.[0]?.status?.type?.completed === true
    || event.status?.type?.completed === true;
}

function directionAndLine(row) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`;
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
      category: group.type || group.name || group.displayName || '',
      values: Object.fromEntries((group.keys || []).map((key, index) => [key, athlete.stats?.[index]]))
    }))
  ));
}

function statSpec(row, entries) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`.toLowerCase();
  const player = entries.find((entry) => compact(row.selection).includes(compact(entry.name)) && compact(entry.name).length >= 5);
  if (!player) return null;
  const pick = (category, key, label, transform = Number) => ({ player, category, key, label, transform });
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
  if (/pass(?:ing)? completions?/.test(text)) return pick('passing', ['completions', 'passingCompletions'], 'pass completions');
  if (/pass(?:ing)? attempts?/.test(text)) return pick('passing', ['passingAttempts', 'attempts'], 'pass attempts');
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
  return null;
}

function statValue(entry, key) {
  const keys = Array.isArray(key) ? key : [key];
  for (const candidate of keys) {
    const value = Number(entry?.values?.[candidate]);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function inningsToOuts(value) {
  const match = String(value || '').match(/^(\d+)(?:\.(\d))?$/);
  if (!match) return NaN;
  return Number(match[1]) * 3 + Number(match[2] || 0);
}

function moneylineGrade(row, summary) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`.toLowerCase();
  if (!/\b(?:ml|moneyline)\b/.test(text)) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  const team = competitors.find((competitor) => {
    const names = [competitor.team?.displayName, competitor.team?.shortDisplayName, competitor.team?.abbreviation]
      .map(compact).filter((name) => name.length >= 3);
    return names.some((name) => compact(row.selection).includes(name));
  });
  if (!team || typeof team.winner !== 'boolean') return null;
  return { result: team.winner ? 'W' : 'L', outcome: `${team.team?.displayName || 'Team'} ${team.score ?? ''}`.trim() };
}

function gameTotalGrade(row, summary) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`.toLowerCase();
  if (!/\b(?:full game|game|match) total\b/.test(text)) return null;
  const comparison = directionAndLine(row);
  if (!comparison) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  const scores = competitors.map((competitor) => Number(competitor.score));
  if (scores.length !== 2 || scores.some((score) => !Number.isFinite(score))) return null;
  const actual = scores[0] + scores[1];
  return { result: compare(actual, comparison), outcome: `Final game total: ${actual}` };
}

function spreadGrade(row, summary) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`;
  if (!/\bspread\b/i.test(text)) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  const team = competitors.find((competitor) => {
    const names = [competitor.team?.displayName, competitor.team?.shortDisplayName, competitor.team?.abbreviation]
      .map(compact).filter((name) => name.length >= 2);
    return names.some((name) => compact(row.selection).includes(name));
  });
  const opponent = competitors.find((competitor) => competitor !== team);
  const line = Number(`${row.selection || ''} ${row.published_line || ''}`.match(/(?:^|\s)([+-]\d+(?:\.\d+)?)(?=\s|$)/)?.[1]);
  const teamScore = Number(team?.score);
  const opponentScore = Number(opponent?.score);
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

async function gradePickFromEspn(row, { fetchImpl = fetch } = {}) {
  if (String(row.result || 'PENDING').toUpperCase() !== 'PENDING') return { status: 'SKIPPED', reason: 'Pick is already graded.' };
  const league = leagueFor(row);
  const date = eventDate(row.operating_date);
  if (!league || !date) return { status: 'PENDING', reason: 'Unsupported league or missing operating date.' };
  let scoreboard;
  try {
    scoreboard = await getJson(`${ESPN_BASE_URL}/${league.path}/scoreboard?dates=${date}&limit=100`, fetchImpl);
  } catch (error) {
    return { status: 'PENDING', reason: error.message };
  }
  const event = matchingEvent(row, scoreboard.events);
  if (!event?.id) return { status: 'PENDING', reason: 'No matching ESPN event was found.' };
  let summary;
  try {
    summary = await getJson(`${ESPN_BASE_URL}/${league.path}/summary?event=${event.id}`, fetchImpl);
  } catch (error) {
    return { status: 'PENDING', reason: error.message };
  }
  if (!completed(summary, event)) return { status: 'PENDING', reason: 'The ESPN event is not final.' };
  const source = `${league.url}${event.id}`;
  const moneyline = moneylineGrade(row, summary);
  if (moneyline) return { status: 'GRADED', ...moneyline, source };
  const gameTotal = gameTotalGrade(row, summary);
  if (gameTotal) return { status: 'GRADED', ...gameTotal, source };
  const spread = spreadGrade(row, summary);
  if (spread) return { status: 'GRADED', ...spread, source };
  const comparison = directionAndLine(row);
  if (!comparison) return { status: 'PENDING', reason: 'No clear over/under line was found.' };
  const spec = statSpec(row, athleteEntries(summary));
  if (!spec) return { status: 'PENDING', reason: 'No supported, exact player-stat match was found.' };
  const entry = athleteEntries(summary).find((candidate) => compact(candidate.name) === compact(spec.player.name) && candidate.category === spec.category);
  const actual = spec.transform(statValue(entry, spec.key));
  if (!Number.isFinite(actual)) return { status: 'PENDING', reason: 'The final ESPN box score did not contain the required stat.' };
  return {
    status: 'GRADED',
    result: compare(actual, comparison),
    outcome: `${spec.player.name}: ${actual} ${spec.label}`,
    source
  };
}

module.exports = { gameTotalGrade, gradePickFromEspn, inningsToOuts, matchingEvent, spreadGrade, statSpec };
