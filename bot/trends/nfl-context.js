'use strict';

const { parseCsv } = require('./nflverse');

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const MAX_FEED_AGE_MS = 36 * 60 * 60_000;
let cached = null;

function parseReleaseTimestamp(body) {
  const raw = JSON.parse(body)?.last_updated;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (EST|EDT)$/.exec(raw || '');
  if (!match) throw new Error('Unrecognized nflverse release timestamp');
  const parsed = Date.parse(`${match[1]}T${match[2]}${match[3] === 'EST' ? '-05:00' : '-04:00'}`);
  if (!Number.isFinite(parsed)) throw new Error('Invalid nflverse release timestamp');
  return new Date(parsed).toISOString();
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`nflverse context feed unavailable (${response.status})`);
  return response.text();
}

async function snapshot({ season, fetchImpl = fetch, now = Date.now() }) {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) throw new Error('Invalid NFL season');
  if (cached?.season === season && now - cached.fetchedAtMs < 30 * 60_000) return cached;
  const rosterUrl = `${BASE}/rosters/roster_${season}.csv`;
  const injuryUrl = `${BASE}/injuries/injuries_${season}.csv`;
  const [rosterCsv, injuryCsv, rosterTimestampBody, injuryTimestampBody] = await Promise.all([
    fetchText(rosterUrl, fetchImpl), fetchText(injuryUrl, fetchImpl),
    fetchText(`${BASE}/rosters/timestamp.json`, fetchImpl),
    fetchText(`${BASE}/injuries/timestamp.json`, fetchImpl)
  ]);
  const rosterUpdatedAt = parseReleaseTimestamp(rosterTimestampBody);
  const injuryUpdatedAt = parseReleaseTimestamp(injuryTimestampBody);
  const rosters = parseCsv(rosterCsv);
  const injuries = parseCsv(injuryCsv);
  if (!rosters.length || !Object.hasOwn(rosters[0], 'gsis_id') || !Object.hasOwn(rosters[0], 'status') ||
      !injuries.length || !Object.hasOwn(injuries[0], 'gsis_id') || !Object.hasOwn(injuries[0], 'report_status'))
    throw new Error('Unknown nflverse roster or injury schema');
  cached = { season, rosters, injuries, rosterUpdatedAt, injuryUpdatedAt,
    rosterUrl, injuryUrl, fetchedAtMs: now };
  return cached;
}

function sourceFresh(timestamp, now) {
  const updatedAt = Date.parse(timestamp);
  return Number.isFinite(updatedAt) && updatedAt <= now && now - updatedAt <= MAX_FEED_AGE_MS;
}

function latestByWeek(rows, season, playerId) {
  return rows.filter(row => row.season === String(season) && row.gsis_id === playerId &&
      Number.isInteger(Number(row.week)))
    .sort((a, b) => Number(b.week) - Number(a.week))[0] || null;
}

async function playerContext({ season, playerId, fetchImpl, now = Date.now() }) {
  if (!playerId) throw new Error('Player ID required');
  const data = await snapshot({ season, fetchImpl, now });
  const roster = latestByWeek(data.rosters, season, playerId);
  const report = latestByWeek(data.injuries, season, playerId);
  const rosterFresh = sourceFresh(data.rosterUpdatedAt, now);
  const injuryFresh = sourceFresh(data.injuryUpdatedAt, now);
  return {
    roster: roster ? { team: roster.team || null, position: roster.position || null,
      status: roster.status || null, week: Number(roster.week) } : null,
    injury: report ? { week: Number(report.week), reportStatus: report.report_status || null,
      reportInjury: report.report_primary_injury || null,
      practiceStatus: report.practice_status || null } : null,
    rosterFresh, injuryFresh,
    rosterUpdatedAt: data.rosterUpdatedAt, injuryUpdatedAt: data.injuryUpdatedAt,
    rosterUrl: data.rosterUrl, injuryUrl: data.injuryUrl
  };
}

function formatContext(context) {
  if (!context) return 'Roster and injury context unavailable; current status is unknown.';
  const roster = context.rosterFresh && context.roster
    ? `Roster: ${context.roster.team || 'team unknown'} · ${context.roster.position || 'position unknown'} · ${context.roster.status || 'status unknown'} (week ${context.roster.week}; feed ${context.rosterUpdatedAt})`
    : `Roster: not current or not found (feed ${context.rosterUpdatedAt})`;
  const injury = context.injuryFresh && context.injury &&
    context.injury.week >= (context.roster?.week || 0)
    ? `Injury report: ${context.injury.reportStatus || 'no game designation in this report'}${context.injury.reportInjury ? ` · ${context.injury.reportInjury}` : ''}${context.injury.practiceStatus ? ` · practice: ${context.injury.practiceStatus}` : ''} (week ${context.injury.week}; feed ${context.injuryUpdatedAt})`
    : `Injury report: current player status not confirmed (feed ${context.injuryUpdatedAt})`;
  return `${roster}\n${injury}`;
}

module.exports = { parseReleaseTimestamp, snapshot, sourceFresh, playerContext, formatContext };
