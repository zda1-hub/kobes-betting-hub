const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

function pacificDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function espnLeague(packet) {
  const text = `${packet.source?.text || ''} ${packet.analysis?.extraction?.league || ''} ${packet.analysis?.extraction?.sport || ''}`.toLowerCase();
  if (/\bmlb\b|baseball/.test(text)) return 'baseball/mlb';
  if (/\bncaaf\b|college football/.test(text)) return 'football/college-football';
  if (/\bnfl\b|football/.test(text)) return 'football/nfl';
  if (/\bwnba\b/.test(text)) return 'basketball/wnba';
  if (/\bncaab\b|college basketball|men.s college basketball/.test(text)) return 'basketball/mens-college-basketball';
  if (/\bnba\b|basketball/.test(text)) return 'basketball/nba';
  if (/\bnhl\b|hockey/.test(text)) return 'hockey/nhl';
  if (/\bmls\b/.test(text)) return 'soccer/usa.1';
  return null;
}

function isSupportedSportPick(packet) {
  return Boolean(espnLeague(packet));
}

function isNFLPick(packet) {
  const extraction = packet.analysis?.extraction || {};
  const classification = [
    packet.source?.text || '',
    extraction.sport || '',
    extraction.league || ''
  ].join(' ');
  if (!/\b(?:nfl|football)\b/i.test(classification)) return false;

  return !/\b(?:mlb|baseball|nba|wnba|ncaab|basketball|nhl|hockey|mls|soccer)\b/i.test(classification);
}

function compact(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesExtractedEvent(packet, event) {
  const sourceEvent = compact(packet.analysis?.extraction?.event);
  if (!sourceEvent) return false;
  const competitors = event.competitions?.[0]?.competitors || [];
  const teamNames = competitors.flatMap((competitor) => [
    competitor.team?.displayName,
    competitor.team?.shortDisplayName,
    competitor.team?.abbreviation
  ]).map(compact).filter((name) => name.length >= 3);
  return new Set(teamNames.filter((name) => sourceEvent.includes(name))).size >= 2;
}

function extractedPlayerNames(packet) {
  const extraction = packet.analysis?.extraction || {};
  const plays = Array.isArray(extraction.plays) && extraction.plays.length
    ? extraction.plays
    : [extraction];
  return [...new Set(plays
    .map((play) => play.player_name || play.playerName || '')
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim()))];
}

function rosterAthletes(roster) {
  const athletes = Array.isArray(roster?.athletes)
    ? roster.athletes
    : Array.isArray(roster?.entries) ? roster.entries : [];
  return athletes.flatMap((entry) => Array.isArray(entry?.items) ? entry.items : [entry])
    .map((entry) => entry?.athlete || entry)
    .filter(Boolean);
}

function athleteMatchesName(athlete, playerName) {
  const names = [
    athlete.displayName,
    athlete.fullName,
    athlete.shortName,
    [athlete.firstName, athlete.lastName].filter(Boolean).join(' ')
  ].map(compact).filter((name) => name.length >= 4);
  const target = compact(playerName);
  return names.some((name) => name === target || name.includes(target) || target.includes(name));
}

async function verifyPlayersOnEventTeams(packet, event, leaguePath, fetchImpl) {
  const playerNames = extractedPlayerNames(packet);
  if (!playerNames.length) return null;

  const competitors = event.competitions?.[0]?.competitors || [];
  const teamIds = [...new Set(competitors.map((competitor) => competitor.team?.id).filter(Boolean))];
  if (teamIds.length < 2) {
    return { status: 'UNVERIFIABLE', reason: 'ESPN did not provide both event team IDs for player verification.' };
  }

  const athletes = [];
  try {
    for (const teamId of teamIds) {
      const response = await fetchImpl(`${ESPN_BASE_URL}/${leaguePath}/teams/${teamId}/roster`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return { status: 'UNVERIFIABLE', reason: `ESPN roster verification returned ${response.status}.` };
      athletes.push(...rosterAthletes(await response.json()));
    }
  } catch {
    return { status: 'UNVERIFIABLE', reason: 'ESPN roster verification was unavailable.' };
  }

  const missing = playerNames.find((playerName) => !athletes.some((athlete) => athleteMatchesName(athlete, playerName)));
  if (missing) {
    return {
      status: 'PLAYER_NOT_ON_EVENT_TEAM',
      reason: `${missing} is not listed on either team in the matched ESPN event.`
    };
  }
  return null;
}

async function upcomingEventStatus(packet, { now = new Date(), fetchImpl = fetch } = {}) {
  const leaguePath = espnLeague(packet);
  if (!leaguePath) return { status: 'UNVERIFIABLE', reason: 'No supported league for current-day schedule check.' };
  if (!packet.analysis?.extraction?.event?.trim()) return { status: 'UNVERIFIABLE', reason: 'The source did not identify an exact event.' };

  const date = pacificDate(now).replaceAll('-', '');
  let scoreboard;
  try {
    const response = await fetchImpl(`${ESPN_BASE_URL}/${leaguePath}/scoreboard?dates=${date}&limit=100`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return { status: 'UNVERIFIABLE', reason: `ESPN returned ${response.status}.` };
    scoreboard = await response.json();
  } catch {
    return { status: 'UNVERIFIABLE', reason: 'ESPN schedule check was unavailable.' };
  }

  const event = (scoreboard.events || []).find((candidate) => matchesExtractedEvent(packet, candidate));
  if (!event?.date) return { status: 'NOT_SCHEDULED_TODAY', reason: 'No matching event is scheduled today.' };
  const start = new Date(event.date);
  if (Number.isNaN(start.getTime())) return { status: 'UNVERIFIABLE', reason: 'ESPN did not provide a readable start time.' };
  const playerVerification = await verifyPlayersOnEventTeams(packet, event, leaguePath, fetchImpl);
  if (playerVerification) return { ...playerVerification, eventStart: start.toISOString(), source: 'ESPN schedule and roster' };
  return start.getTime() > now.getTime()
    ? { status: 'UPCOMING', eventStart: start.toISOString(), source: 'ESPN schedule' }
    : { status: 'STARTED_OR_FINISHED', eventStart: start.toISOString(), source: 'ESPN schedule' };
}

function isRecentSourcePost(packet, { now = new Date(), maximumAgeHours = Number(process.env.X_MONITOR_MAX_POST_AGE_HOURS || 24) } = {}) {
  const posted = new Date(packet.source?.posted_at || '');
  if (Number.isNaN(posted.getTime())) return false;
  const hours = Number.isFinite(maximumAgeHours) && maximumAgeHours > 0 ? maximumAgeHours : 24;
  return now.getTime() - posted.getTime() <= hours * 60 * 60 * 1000;
}

module.exports = { athleteMatchesName, espnLeague, extractedPlayerNames, isNFLPick, isRecentSourcePost, isSupportedSportPick, matchesExtractedEvent, upcomingEventStatus };
