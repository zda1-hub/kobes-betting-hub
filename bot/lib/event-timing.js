const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

function pacificDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function espnLeague(packet) {
  const text = `${packet.analysis?.extraction?.league || ''} ${packet.analysis?.extraction?.sport || ''}`.toLowerCase();
  if (/\bmlb\b|baseball/.test(text)) return 'baseball/mlb';
  if (/\bnfl\b|football/.test(text)) return 'football/nfl';
  return null;
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

async function upcomingEventStatus(packet, { now = new Date(), fetchImpl = fetch } = {}) {
  const leaguePath = espnLeague(packet);
  if (!leaguePath) return { status: 'UNKNOWN', reason: 'No supported league for automatic schedule check.' };
  if (!packet.analysis?.extraction?.event?.trim()) return { status: 'UNKNOWN', reason: 'The source did not identify an exact event.' };

  const date = pacificDate(now).replaceAll('-', '');
  let scoreboard;
  try {
    const response = await fetchImpl(`${ESPN_BASE_URL}/${leaguePath}/scoreboard?dates=${date}&limit=100`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return { status: 'UNKNOWN', reason: `ESPN returned ${response.status}.` };
    scoreboard = await response.json();
  } catch {
    return { status: 'UNKNOWN', reason: 'ESPN schedule check was unavailable.' };
  }

  const event = (scoreboard.events || []).find((candidate) => matchesExtractedEvent(packet, candidate));
  if (!event?.date) return { status: 'UNKNOWN', reason: 'No matching ESPN event was found.' };
  const start = new Date(event.date);
  if (Number.isNaN(start.getTime())) return { status: 'UNKNOWN', reason: 'ESPN did not provide a readable start time.' };
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

module.exports = { isRecentSourcePost, matchesExtractedEvent, upcomingEventStatus };
