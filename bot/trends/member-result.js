'use strict';

const { TEAM_NAMES } = require('./nfl-auto');
const { MIN_OBSERVED_GAMES } = require('./bulk-report');

const FOOTER = '21+ | Research only, not a guarantee';
const INSUFFICIENT_SAMPLE = `No qualifying trend: fewer than ${MIN_OBSERVED_GAMES} observed games.\n${FOOTER}`;
const STAT_LABELS = Object.freeze({
  points: 'Points', rebounds: 'Rebounds', assists: 'Assists', threes: '3PM',
  pra: 'PRA', points_rebounds: 'P+R', points_assists: 'P+A', rebounds_assists: 'R+A',
  passing_yards: 'Pass yds', rushing_yards: 'Rush yds', receiving_yards: 'Rec yds',
  receptions: 'Receptions', rush_receiving_yards: 'Rush+rec yds',
  anytime_touchdown: 'Anytime TD'
});

function windowText(label, row) {
  const hits = Number(row?.hits);
  const sample = Number(row?.sample);
  if (!Number.isInteger(hits) || !Number.isInteger(sample) || sample <= 0 || hits < 0 || hits > sample)
    return `${label}- unavailable`;
  return `${label}- ${hits}/${sample}${hits / sample >= 0.8 ? ' ☘️' : ''}`;
}

function oddsText(odds, source) {
  return source === 'The Odds API' && Number.isInteger(odds) && Math.abs(odds) >= 100 ?
    ` (${odds > 0 ? '+' : ''}${odds})` : '';
}

function verifiedPrice(offer, checkedAt) {
  if (!offer || !Number.isFinite(Date.parse(checkedAt)) ||
      !Number.isInteger(offer.odds) || !offer.sportsbook || !offer.sportsbookKey) return undefined;
  return offer.odds;
}

function formatMemberResult({ player, teamAbbr, teamName, stat, line, odds, oddsSource, analysis }) {
  if (!player || !teamAbbr || !teamName || !stat || !Number.isFinite(line) || !analysis)
    throw new Error('Verified player, team, line and game logs are required');
  if (!Number.isInteger(analysis.l20?.sample) ||
      analysis.l20.sample < MIN_OBSERVED_GAMES) return INSUFFICIENT_SAMPLE;
  const safe = value => String(value).replaceAll('*', '').replaceAll('@', '');
  return `${safe(player)} - *${safe(teamAbbr)} ${safe(teamName)}*\n` +
    `Over ${line} ${safe(stat)}${oddsText(odds, oddsSource)}\n` +
    `${windowText('L5', analysis.l5)}\n${windowText('L10', analysis.l10)}\n` +
    `${windowText('L20', analysis.l20)}\n${FOOTER}`;
}

function nbaResult(result) {
  const name = result.team || '';
  const abbr = result.teamAbbr || '';
  const odds = verifiedPrice(result.offers?.[0], result.marketCheckedAt);
  return formatMemberResult({ player: result.player, teamAbbr: abbr,
    teamName: name.split(' ').at(-1), stat: STAT_LABELS[result.stat] || result.stat,
    line: result.line, odds, oddsSource: odds === undefined ? undefined : 'The Odds API',
    analysis: result.analysis });
}

function nflResult({ history, market }) {
  const abbr = history.context?.roster?.team || history.lastRecordedTeam;
  const team = TEAM_NAMES[abbr];
  if (!team) throw new Error('Verified NFL team is unavailable');
  const odds = verifiedPrice(market.offers?.[0], market.fetchedAt);
  return formatMemberResult({ player: history.player, teamAbbr: abbr,
    teamName: team.split(' ').at(-1), stat: STAT_LABELS[history.stat] || history.stat,
    line: market.line, odds, oddsSource: odds === undefined ? undefined : 'The Odds API',
    analysis: history.analysis });
}

module.exports = { FOOTER, INSUFFICIENT_SAMPLE, STAT_LABELS, windowText,
  formatMemberResult, nbaResult, nflResult };
