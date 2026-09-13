const { auditedFetch } = require('../../pipeline/api-client');
const { espnLeague, upcomingEventStatuses } = require('./event-timing');
const { sourceEvidence, visiblePlays } = require('./source-review');

const ESPN_STATS_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports';
const MIN_WRITEUP_EVIDENCE = 4;
const MAX_WRITEUP_EVIDENCE = 8;

const MARKET_STATS = [
  { pattern: /receiving\s+(?:yards?|yds?)/i, names: ['receivingYards'], label: 'receiving yards' },
  { pattern: /passing\s+(?:yards?|yds?)/i, names: ['passingYards'], label: 'passing yards' },
  { pattern: /rushing\s+(?:yards?|yds?)/i, names: ['rushingYards'], label: 'rushing yards' },
  { pattern: /receptions?/i, names: ['receptions'], label: 'receptions' },
  { pattern: /passing\s+(?:touchdowns?|tds?)/i, names: ['passingTouchdowns'], label: 'passing touchdowns' },
  { pattern: /rushing\s+(?:touchdowns?|tds?)/i, names: ['rushingTouchdowns'], label: 'rushing touchdowns' },
  { pattern: /receiving\s+(?:touchdowns?|tds?)/i, names: ['receivingTouchdowns'], label: 'receiving touchdowns' },
  { pattern: /completions?/i, names: ['completions'], label: 'completions' },
  { pattern: /passing\s+attempts?/i, names: ['passingAttempts'], label: 'passing attempts' },
  { pattern: /rushing\s+attempts?|carries/i, names: ['rushingAttempts'], label: 'rushing attempts' },
  { pattern: /interceptions?/i, names: ['interceptions'], label: 'interceptions' },
  { pattern: /total\s+bases?/i, names: ['totalBases'], label: 'total bases' },
  { pattern: /strikeouts?|\bk'?s\b/i, names: ['strikeouts', 'pitchingStrikeouts'], label: 'strikeouts' },
  { pattern: /hits?\s+allowed/i, names: ['hitsAllowed'], label: 'hits allowed' },
  { pattern: /earned\s+runs?/i, names: ['earnedRuns'], label: 'earned runs' },
  { pattern: /\brbi\b/i, names: ['RBIs', 'rbi'], label: 'RBIs' },
  { pattern: /\bhits?\b/i, names: ['hits'], label: 'hits' },
  { pattern: /\bpoints?\b/i, names: ['points'], label: 'points' },
  { pattern: /rebounds?/i, names: ['rebounds', 'totalRebounds'], label: 'rebounds' },
  { pattern: /assists?/i, names: ['assists'], label: 'assists' },
  { pattern: /three[- ]pointers?|threes?/i, names: ['threePointFieldGoalsMade'], label: 'three-pointers' },
  { pattern: /blocks?/i, names: ['blocks'], label: 'blocks' },
  { pattern: /steals?/i, names: ['steals'], label: 'steals' },
  { pattern: /shots?\s+on\s+goal/i, names: ['shotsOnGoal'], label: 'shots on goal' },
  { pattern: /\bsaves?\b/i, names: ['saves'], label: 'saves' },
  { pattern: /\bgoals?\b/i, names: ['goals'], label: 'goals' }
];

function numberValue(value) {
  const parsed = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value) {
  return Number(value.toFixed(1)).toString();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function marketForTerms(terms) {
  return MARKET_STATS.find((market) => market.pattern.test(String(terms || ''))) || null;
}

function thresholdForTerms(terms) {
  const text = String(terms || '');
  const directional = text.match(/\b(over|under)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (directional) return { direction: directional[1].toLowerCase(), line: Number(directional[2]) };
  const compact = text.match(/\b([ou])\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (compact) return { direction: compact[1].toLowerCase() === 'o' ? 'over' : 'under', line: Number(compact[2]) };
  const plus = text.match(/\b([0-9]+(?:\.[0-9]+)?)\+\b/);
  if (plus) return { direction: 'at_least', line: Number(plus[1]) };
  return null;
}

function gameRows(gamelog, market) {
  const statIndex = market.names.map((name) => (gamelog.names || []).indexOf(name)).find((index) => index >= 0);
  if (!Number.isInteger(statIndex) || statIndex < 0) return [];
  const eventById = gamelog.events || {};
  const seasonTypes = Array.isArray(gamelog.seasonTypes) ? gamelog.seasonTypes : [];
  const season = seasonTypes.find((entry) => /regular/i.test(entry.displayName || '')) || seasonTypes[0];
  const categories = Array.isArray(season?.categories) ? season.categories : [];
  const eventCategory = categories.find((entry) => Array.isArray(entry.events)) || categories[0];
  return (eventCategory?.events || [])
    .map((row) => ({
      value: numberValue(row.stats?.[statIndex]),
      date: Date.parse(eventById[row.eventId]?.gameDate || ''),
      eventId: row.eventId
    }))
    .filter((row) => row.value !== null)
    .sort((a, b) => (Number.isFinite(b.date) ? b.date : 0) - (Number.isFinite(a.date) ? a.date : 0));
}

function hit(value, threshold) {
  if (threshold.direction === 'over') return value > threshold.line;
  if (threshold.direction === 'under') return value < threshold.line;
  return value >= threshold.line;
}

function evidenceFromGamelog({ gamelog, playerName, terms, sourceUrl }) {
  const market = marketForTerms(terms);
  const threshold = thresholdForTerms(terms);
  if (!market || !threshold) return [];
  const rows = gameRows(gamelog, market);
  if (!rows.length) return [];
  const values = rows.map((row) => row.value);
  const seasonName = ((gamelog.seasonTypes || []).find((entry) => /regular/i.test(entry.displayName || ''))?.displayName
    || gamelog.seasonTypes?.[0]?.displayName
    || 'the most recent regular season').replace(/Regular Season/i, 'regular season');
  const seasonHits = values.filter((value) => hit(value, threshold)).length;
  const recent = values.slice(0, Math.min(10, values.length));
  const recentHits = recent.filter((value) => hit(value, threshold)).length;
  const verb = threshold.direction === 'under' ? 'finished under' : threshold.direction === 'at_least' ? 'reached' : 'cleared';
  const facts = [
    `${playerName} averaged ${rounded(values.reduce((sum, value) => sum + value, 0) / values.length)} ${market.label} per game in ${seasonName} (${values.length} games)`,
    `${playerName} ${verb} ${threshold.line} ${market.label} in ${seasonHits} of ${values.length} games (${rounded((seasonHits / values.length) * 100)}%)`,
    `Over the last ${recent.length} games, ${playerName} ${verb} ${threshold.line} in ${recentHits} (${rounded((recentHits / recent.length) * 100)}%)`,
    `${playerName} had a last-${recent.length} average of ${rounded(recent.reduce((sum, value) => sum + value, 0) / recent.length)} ${market.label}, with a median of ${rounded(median(recent))}`
  ];
  const retrievedAt = new Date().toISOString();
  return facts.map((text) => ({
    text,
    origin: 'espn',
    provider: 'ESPN',
    source_url: sourceUrl,
    retrieved_at: retrievedAt,
    market_stat: market.names[0]
  }));
}

async function fetchGamelog({ packet, athlete, seasonYear, fetchImpl = fetch }) {
  const leaguePath = espnLeague(packet);
  if (!leaguePath || !athlete?.id) return null;
  const priorSeason = Number.isInteger(Number(seasonYear))
    ? Number(seasonYear) - 1
    : new Date().getUTCFullYear() - 1;
  const url = `${ESPN_STATS_BASE}/${leaguePath}/athletes/${athlete.id}/gamelog?region=us&lang=en&contentorigin=espn&season=${priorSeason}`;
  const response = await auditedFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  }, {
    service: 'espn',
    endpointClass: '/apis/common/v3/sports/{sport}/{league}/athletes/{athlete_id}/gamelog',
    callerComponent: 'bot/lib/espn-pick-research',
    triggerType: 'candidate_evidence_enrichment',
    workflowId: packet.pick_id,
    pickId: packet.pick_id
  }, fetchImpl);
  if (!response.ok) return null;
  return { payload: await response.json(), url };
}

async function fillMissingEvidence(packet, { timing, fetchImpl = fetch } = {}) {
  const existingCount = sourceEvidence(packet).length;
  if (existingCount >= MIN_WRITEUP_EVIDENCE) {
    return { packet, added: 0, complete: true, sourceEvidenceCount: existingCount, espnCalls: 0 };
  }
  const status = timing || await upcomingEventStatuses(packet, { fetchImpl });
  if (status.status !== 'UPCOMING') {
    return { packet, added: 0, complete: false, sourceEvidenceCount: existingCount, espnCalls: 0, reason: status.reason || status.status };
  }
  const plays = visiblePlays(packet);
  if (plays.length !== 1) {
    return { packet, added: 0, complete: false, sourceEvidenceCount: existingCount, espnCalls: 0, reason: 'Research enrichment requires one play per approval card.' };
  }
  const athlete = status.playStatuses?.[0]?.athlete || status.athlete;
  const playerName = athlete?.fullName || athlete?.displayName || plays[0].playerName;
  if (!athlete?.id || !playerName) {
    return { packet, added: 0, complete: false, sourceEvidenceCount: existingCount, espnCalls: 0, reason: 'ESPN could not resolve the player on the matched event roster.' };
  }
  let gamelog;
  try {
    gamelog = await fetchGamelog({ packet, athlete, seasonYear: status.seasonYear || status.playStatuses?.[0]?.seasonYear, fetchImpl });
  } catch (error) {
    return { packet, added: 0, complete: false, sourceEvidenceCount: existingCount, espnCalls: 1, reason: error instanceof Error ? error.message : 'ESPN research was unavailable.' };
  }
  if (!gamelog) {
    return { packet, added: 0, complete: false, sourceEvidenceCount: existingCount, espnCalls: 1, reason: 'ESPN did not return a usable game log.' };
  }
  const candidates = evidenceFromGamelog({ gamelog: gamelog.payload, playerName, terms: plays[0].terms, sourceUrl: gamelog.url });
  const extraction = packet.analysis.extraction;
  const priorNotes = Array.isArray(extraction.supporting_notes) ? extraction.supporting_notes : [];
  extraction.supporting_notes = [...priorNotes];
  for (const candidate of candidates) {
    if (sourceEvidence(packet).length >= MIN_WRITEUP_EVIDENCE) break;
    extraction.supporting_notes.push(candidate);
  }
  extraction.supporting_notes = extraction.supporting_notes.slice(0, MAX_WRITEUP_EVIDENCE);
  const finalCount = sourceEvidence(packet).length;
  return {
    packet,
    added: Math.max(0, finalCount - existingCount),
    complete: finalCount >= MIN_WRITEUP_EVIDENCE,
    sourceEvidenceCount: finalCount,
    espnCalls: 1,
    reason: finalCount >= MIN_WRITEUP_EVIDENCE ? null : 'ESPN could not supply enough relevant facts for the locked writeup format.'
  };
}

module.exports = {
  MAX_WRITEUP_EVIDENCE,
  MIN_WRITEUP_EVIDENCE,
  evidenceFromGamelog,
  fillMissingEvidence,
  gameRows,
  marketForTerms,
  thresholdForTerms
};
