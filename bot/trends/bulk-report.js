'use strict';

const { analyze } = require('./analytics');
const { STATS } = require('./prop-flow');

const FOOTER = 'Research only, not a guarantee';
const WINDOWS = { L5: 'l5', L10: 'l10', L20: 'l20' };
const MIN_OBSERVED_GAMES = 6;

function calcLine(logs, stat) {
  const values = logs.filter(row => row.status === 'final' && row.participated === true &&
    Number.isFinite(row.stats?.[stat]))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10)
    .map(row => row.stats[stat]).sort((a, b) => a - b);
  if (!values.length) return null;
  // A lower-median half-point is a reproducible *research threshold*, never a
  // claim that a sportsbook lists this line. Its hit rate is still measured.
  const median = values[Math.floor((values.length - 1) / 2)];
  return Math.max(0.5, Math.floor(median) - 0.5);
}
function statLabel(sport, stat) {
  return STATS[sport]?.find(([value]) => value === stat)?.[1] || stat.replaceAll('_', ' ');
}
function windowLine(name, window) {
  const high = window.sample > 0 && window.hitRate >= 0.8;
  return `${name}- ${window.hits}/${window.sample}${high ? ' ☘️' : ''}`;
}
function qualifies(analysis) {
  return analysis.l20?.sample >= MIN_OBSERVED_GAMES &&
    ['l5', 'l10', 'l20'].some(key => analysis[key]?.sample > 0 && analysis[key].hitRate >= 0.8);
}
function buildResult({ sport, player, teamAbbr, teamName, opponentAbbr, stat,
  logs, selectedWindow = 'L10', line = null, odds = null, oddsSource = null,
  opponentRank = null, position = null, rankTeams = null, dataDate = null,
  minimumRate = 0.8, requireAny80 = true }) {
  const threshold = line === null ? calcLine(logs, stat) : line;
  if (!Number.isFinite(threshold) || threshold < 0) return null;
  const analysis = analyze(logs, { stat, line: threshold, side: 'over' });
  // L5 is a five-game display window. Eligibility uses the larger observed
  // history so L5 remains usable while a player with only 1-5 games is omitted.
  if (analysis.l20.sample < MIN_OBSERVED_GAMES ||
    (requireAny80 && !qualifies(analysis)) ||
    !(analysis[WINDOWS[selectedWindow]]?.hitRate >= minimumRate)) return null;
  const hasRealOdds = Number.isInteger(odds) && Math.abs(odds) >= 100 && oddsSource === 'The Odds API';
  const rate = ['L5', 'L10', 'L20'].map(label => windowLine(label, analysis[WINDOWS[label]])).join('  ');
  const rank = Number.isInteger(opponentRank) && Number.isInteger(rankTeams) && position ?
    `#${opponentRank} of ${rankTeams}` : 'N/A';
  const block = `${player} - *${teamAbbr}${teamName ? ` ${teamName}` : ''}* vs ${opponentAbbr || 'OPP N/A'}\n` +
    `Over ${threshold} ${statLabel(sport, stat)} ` +
    (hasRealOdds ? `(${odds > 0 ? '+' : ''}${odds})` : '(Calc line (no book line))') + '\n' +
    `${rate}\nOpp rank vs ${position || 'position N/A'} in ${statLabel(sport, stat)}: ${rank}` +
    (dataDate ? ` · data ${dataDate}` : '') +
    (sport === 'NFL' ? '\nData: nflverse (CC BY 4.0)' : '');
  return { sport, teamAbbr, player, stat, threshold, analysis, block,
    opponentAbbr, position, rank: Number.isInteger(opponentRank) ? opponentRank : null,
    rankTeams: Number.isInteger(rankTeams) ? rankTeams : null, dataDate };
}
function formatReport(results) {
  const sorted = [...results].sort((a, b) => a.sport.localeCompare(b.sport) ||
    a.teamAbbr.localeCompare(b.teamAbbr) || a.player.localeCompare(b.player) ||
    a.stat.localeCompare(b.stat));
  if (!sorted.length) return [`No qualifying current-game trends were verified.\n${FOOTER}`];
  const parts = [];
  let previous = {};
  for (const row of sorted) {
    if (row.sport !== previous.sport) parts.push(`**${row.sport}**`);
    if (row.teamAbbr !== previous.teamAbbr || row.sport !== previous.sport)
      parts.push(`**${row.teamAbbr}**`);
    parts.push(row.block);
    previous = row;
  }
  const chunks = [];
  let current = '';
  for (const part of parts) {
    if (part.length + FOOTER.length + 2 > 1900) throw new Error('A Trends result block exceeds Discord limits');
    const next = current ? `${current}\n\n${part}` : part;
    if (next.length + FOOTER.length + 1 > 1900) {
      chunks.push(`${current}\n${FOOTER}`);
      current = part;
    } else current = next;
  }
  if (current) chunks.push(`${current}\n${FOOTER}`);
  return chunks;
}

module.exports = { FOOTER, MIN_OBSERVED_GAMES, calcLine, statLabel, windowLine,
  qualifies, buildResult, formatReport };
