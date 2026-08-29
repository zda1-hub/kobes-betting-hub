const fs = require('node:fs/promises');
const path = require('node:path');
const { pickLogPath } = require('./pick-log');

const LEAGUES = {
  mlb: {
    id: 'mlb',
    name: 'MLB',
    sportPath: 'baseball/mlb',
    standingsPath: 'baseball/mlb'
  },
  nfl: {
    id: 'nfl',
    name: 'NFL',
    sportPath: 'football/nfl',
    standingsPath: 'football/nfl'
  }
};

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
const STANDINGS_URL = 'https://site.web.api.espn.com/apis/v2/sports';

function leagueConfig(league) {
  const normalized = String(league || '').trim().toLowerCase();
  const config = LEAGUES[normalized];
  if (!config) throw new Error('Choose MLB or NFL.');
  return config;
}

function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error('Date must use YYYY-MM-DD.');
  }
  return value.replaceAll('-', '');
}

function espnUrls({ league, date }) {
  const config = leagueConfig(league);
  const dateParam = dateOnly(date);
  return {
    scoreboard: `${BASE_URL}/${config.sportPath}/scoreboard?dates=${dateParam}&limit=100`,
    standings: `${STANDINGS_URL}/${config.standingsPath}/standings?region=us&lang=en&contentorigin=espn&limit=500`
  };
}

async function getJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`ESPN request failed (${response.status}) for ${url}`);
  return response.json();
}

function allStandingEntries(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  if (Array.isArray(node.entries)) output.push(...node.entries);
  if (node.standings) allStandingEntries(node.standings, output);
  if (Array.isArray(node.children)) node.children.forEach((child) => allStandingEntries(child, output));
  return output;
}

function statMap(entry) {
  return new Map((entry.stats || []).map((stat) => [stat.name, stat.displayValue ?? stat.value ?? '—']));
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStandings(standings) {
  const byTeam = new Map();
  for (const entry of allStandingEntries(standings)) {
    const id = String(entry.team?.id || entry.team?.displayName || '');
    if (!id || byTeam.has(id)) continue;
    const stats = statMap(entry);
    byTeam.set(id, {
      id,
      name: entry.team?.displayName || entry.team?.name || 'Unknown team',
      abbreviation: entry.team?.abbreviation || '',
      overall: stats.get('overall') || `${stats.get('wins') || 0}-${stats.get('losses') || 0}`,
      winPercent: numberValue(stats.get('winPercent')),
      home: stats.get('Home') || `${stats.get('homeWins') || 0}-${stats.get('homeLosses') || 0}`,
      road: stats.get('Road') || `${stats.get('roadWins') || 0}-${stats.get('roadLosses') || 0}`,
      lastTen: stats.get('Last Ten Games') || 'not available',
      streak: stats.get('streak') || 'not available',
      differential: stats.get('pointDifferential') || stats.get('differential') || 'not available',
      rank: 0
    });
  }
  const teams = [...byTeam.values()].sort((a, b) => b.winPercent - a.winPercent || a.name.localeCompare(b.name));
  teams.forEach((team, index) => { team.rank = index + 1; });
  return teams;
}

function teamForCompetitor(competitor, teams) {
  const teamId = String(competitor.team?.id || '');
  const exact = teams.find((team) => team.id === teamId);
  if (exact) return exact;
  const name = competitor.team?.displayName || competitor.team?.name || 'Unknown team';
  return teams.find((team) => team.name === name) || {
    id: teamId || name,
    name,
    overall: 'not available',
    home: 'not available',
    road: 'not available',
    lastTen: 'not available',
    streak: 'not available',
    differential: 'not available',
    rank: '—'
  };
}

function formatStart(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return 'time TBD';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(value);
}

function matchupRows(scoreboard, teams) {
  return (scoreboard.events || []).map((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const away = competitors.find((item) => item.homeAway === 'away') || competitors[0];
    const home = competitors.find((item) => item.homeAway === 'home') || competitors[1];
    const awayTeam = teamForCompetitor(away || {}, teams);
    const homeTeam = teamForCompetitor(home || {}, teams);
    return {
      id: event.id,
      name: event.name || `${awayTeam.name} at ${homeTeam.name}`,
      start: formatStart(event.date),
      status: event.status?.type?.description || event.status?.type?.name || 'status unavailable',
      link: event.links?.find((link) => link.href)?.href || '',
      away: awayTeam,
      home: homeTeam
    };
  });
}

function reportPath({ league, date }) {
  const directory = process.env.TRENDS_OUTPUT_PATH?.trim() || path.join(path.dirname(pickLogPath()), 'trends');
  return path.join(directory, `${String(league).toLowerCase()}-${date}.json`);
}

async function generateTrendReport({ league, date, fetchImpl = fetch }) {
  const config = leagueConfig(league);
  const sources = espnUrls({ league: config.id, date });
  const [scoreboard, standings] = await Promise.all([
    getJson(sources.scoreboard, fetchImpl),
    getJson(sources.standings, fetchImpl)
  ]);
  const teams = normalizeStandings(standings);
  return {
    league: config.name,
    leagueId: config.id,
    operatingDate: date,
    generatedAt: new Date().toISOString(),
    disclaimer: 'Research snapshot only. It is not a pick, betting recommendation, or approval to publish.',
    sources,
    leagueTable: teams,
    matchups: matchupRows(scoreboard, teams)
  };
}

async function saveTrendReport(report, output = reportPath({ league: report.leagueId, date: report.operatingDate })) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  return output;
}

function compactTeam(team, site) {
  const split = site === 'home' ? team.home : team.road;
  return `#${team.rank} ${team.name}: ${team.overall} · ${site} ${split} · L10 ${team.lastTen} · ${team.streak}`;
}

function reportEmbeds(report) {
  const top = report.leagueTable.slice(0, 5).map((team) => `#${team.rank} ${team.name} (${team.overall})`).join('\n') || 'No standings returned.';
  const bottom = report.leagueTable.slice(-5).reverse().map((team) => `#${team.rank} ${team.name} (${team.overall})`).join('\n') || 'No standings returned.';
  const summary = {
    color: 0x2f80ed,
    title: `${report.league} Trends Sheet — ${report.operatingDate}`,
    description: `${report.disclaimer}\n\n**League coverage:** ${report.leagueTable.length} teams · ${report.matchups.length} scheduled event(s)\n**Source:** [ESPN standings](${report.sources.standings}) · [ESPN scoreboard](${report.sources.scoreboard})`,
    fields: [
      { name: 'Top current records', value: top, inline: true },
      { name: 'Lowest current records', value: bottom, inline: true }
    ],
    footer: { text: 'Stats are a point-in-time ESPN snapshot. Kobe reviews research; this does not create a pick.' },
    timestamp: report.generatedAt
  };

  const matchupLines = report.matchups.map((matchup) => {
    const eventLink = matchup.link ? `[${matchup.name}](${matchup.link})` : matchup.name;
    return `**${eventLink}** — ${matchup.start} (${matchup.status})\n${compactTeam(matchup.away, 'road')}\n${compactTeam(matchup.home, 'home')}`;
  });
  const embeds = [summary];
  let chunk = '';
  let part = 1;
  for (const line of matchupLines) {
    if (chunk && chunk.length + line.length + 2 > 3800) {
      embeds.push({ color: 0x2f80ed, title: `${report.league} Matchup Trends (${part})`, description: chunk });
      part += 1;
      chunk = '';
    }
    chunk += `${chunk ? '\n\n' : ''}${line}`;
  }
  if (chunk) embeds.push({ color: 0x2f80ed, title: `${report.league} Matchup Trends (${part})`, description: chunk });
  return embeds;
}

module.exports = {
  LEAGUES,
  espnUrls,
  generateTrendReport,
  normalizeStandings,
  reportEmbeds,
  reportPath,
  saveTrendReport
};
