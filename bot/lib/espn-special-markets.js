// Result data only. Prices and stake are never read from ESPN.
function compact(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function number(value) {
  if (value == null || !/^\d+(?:\.\d+)?$/.test(String(value).trim())) return NaN;
  return Number(value);
}
function pending(reason) { return { status: 'PENDING', reason }; }
function compare(actual, direction, line) {
  return actual === line ? 'P' : (direction.toLowerCase() === 'over' ? actual > line : actual < line) ? 'W' : 'L';
}
function selectedTeam(selection, competitors) {
  const prefix = compact(String(selection).split(/\b(?:ML|moneyline|over|under|team total|F5|1H|2H|first half|second half|first five)\b|\s[+-]\d/i)[0]);
  const matches = competitors.filter(c => [c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation, c.team?.name]
    .map(compact).filter(Boolean).includes(prefix));
  return matches.length === 1 ? matches[0] : null;
}
function periodScores(competitors, start, end) {
  if (competitors.length !== 2) return null;
  const scores = competitors.map(c => {
    const periods = c.linescores?.slice(start, end);
    if (!periods || periods.length !== end - start) return NaN;
    const values = periods.map(p => number(p.displayValue ?? p.value));
    return values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : NaN;
  });
  return scores.every(Number.isFinite) ? scores : null;
}
function specialMarketGrade(row, summary, leaguePath) {
  const text = `${row.selection || ''} ${row.market || ''} ${row.published_line || ''}`;
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  if (leaguePath.startsWith('soccer/') && /\b(?:ML|moneyline)\b/i.test(text)) {
    if (/draw no bet|double chance|to qualify|advance|asian/i.test(text)) return pending('This soccer market requires its original settlement rules.');
    const team = selectedTeam(row.selection, competitors);
    const scores = competitors.map(c => number(c.score));
    if (!team || scores.length !== 2 || !scores.every(Number.isFinite)) return pending('Exact soccer team and final goal scores are required.');
    const index = competitors.indexOf(team);
    return { result: scores[index] > scores[1-index] ? 'W' : 'L', outcome: `90-minute three-way moneyline: ${scores[index]}–${scores[1-index]} (draw loses)` };
  }
  const period = text.match(/\b(F5|first five|1H|first half|2H|second half)\b/i)?.[1].toLowerCase();
  const nrfi = /\b(?:NRFI|YRFI)\b/i.test(text);
  if (!period && /\bteam total\b/i.test(text)) {
    const comparison = text.match(/\b(over|under)\s*(\d+(?:\.\d+)?)/i);
    const team = selectedTeam(row.selection, competitors);
    const score = number(team?.score);
    if (!comparison || !team || !Number.isFinite(score)) return pending('An exact team and final numeric score are required for this team total.');
    return { result: compare(score, comparison[1], Number(comparison[2])), outcome: `${team.team.displayName} team total: ${score}` };
  }
  if (period || nrfi) {
    const baseball = leaguePath === 'baseball/mlb';
    const football = leaguePath.startsWith('football/');
    const basketball = leaguePath.startsWith('basketball/');
    if (nrfi && !baseball) return pending('First-inning markets require an identified MLB game.');
    if (baseball && period && !['f5', 'first five'].includes(period)) return pending('Baseball half-game rules are not specified; use an explicit F5 market.');
    if (!baseball && !football && !basketball) return pending('Period rules are not supported for this sport.');
    if (!baseball && ['f5', 'first five'].includes(period)) return pending('F5 applies only to baseball.');
    const second = ['2h', 'second half'].includes(period);
    const halfPeriods = leaguePath === 'basketball/mens-college-basketball' ? 1 : 2;
    const count = nrfi ? 1 : baseball ? 5 : halfPeriods;
    const scores = periodScores(competitors, second ? count : 0, second ? count * 2 : count);
    if (!scores) return pending('The final box score is missing complete, numeric period scores.');
    const total = scores[0] + scores[1];
    const label = nrfi ? 'First inning' : baseball ? 'First five innings' : second ? 'Second half (regulation only)' : 'First half';
    if (second && !/regulation only|excludes overtime/i.test(text)) return pending('Second-half overtime treatment needs the original sportsbook rules.');
    if (nrfi) return { result: (/\bNRFI\b/i.test(text) ? total === 0 : total > 0) ? 'W' : 'L', outcome: `${label}: ${total} runs` };
    const comparison = text.match(/\b(over|under)\s*(\d+(?:\.\d+)?)/i);
    const team = selectedTeam(row.selection, competitors);
    if (comparison) {
      if (!/\btotal\b/i.test(row.market || '') && !/\b(?:game|match|team) total\b/i.test(text) && !/\b(?:vs|at)\b|\//i.test(row.selection || '')) return pending('A period total must explicitly identify a game total or team total.');
      const teamTotal = /\bteam total\b/i.test(text);
      if (teamTotal && !team) return pending('No exact team match for the period team total.');
      const actual = teamTotal ? scores[competitors.indexOf(team)] : total;
      return { result: compare(actual, comparison[1], Number(comparison[2])), outcome: `${label}${teamTotal ? ' team' : ''} total: ${actual}` };
    }
    if (!team) return pending('No exact team match for this period market.');
    const index = competitors.indexOf(team);
    const line = text.match(/(?:^|\s)([+-]\d{1,2}(?:\.\d+)?)(?=\s|$)/)?.[1];
    if (/\b(?:ML|moneyline)\b/i.test(text)) {
      if (/three.way|3.way|draw no bet/i.test(text)) return pending('This period moneyline needs its explicit settlement rules.');
      return { result: scores[index] === scores[1 - index] ? 'P' : scores[index] > scores[1 - index] ? 'W' : 'L', outcome: `${label}: ${scores[index]}–${scores[1 - index]}` };
    }
    if (line == null) return pending('No original period spread was found.');
    const adjusted = scores[index] + Number(line);
    return { result: adjusted === scores[1 - index] ? 'P' : adjusted > scores[1 - index] ? 'W' : 'L', outcome: `${label}: ${scores[index]}–${scores[1 - index]} (${line})` };
  }
  if (/\b(?:anytime|first TD|1st TD|first touchdown)\b/i.test(text)) {
    if (!leaguePath.startsWith('football/')) return pending('Touchdown specials require an identified football game.');
    const names = new Set((summary.boxscore?.players || []).flatMap(t => (t.statistics || []).flatMap(g => (g.athletes || []).map(a => a.athlete?.displayName))).filter(Boolean));
    const prefix = compact(String(row.selection).split(/\b(?:anytime|first TD|1st TD|first touchdown)\b/i)[0]);
    const matches = [...names].filter(n => compact(n) === prefix);
    if (matches.length !== 1) return pending('The touchdown player cannot be uniquely verified as participating.');
    if (!Array.isArray(summary.scoringPlays)) return pending('The final scoring-play feed is unavailable.');
    const touchdowns = summary.scoringPlays.filter(p => /touchdown/i.test(p.type?.text || ''));
    // The receiver, rusher or returner precedes the yardage. A passing QB is not the scorer.
    const scorers = touchdowns.map(p => String(p.text || '').match(/^(.+?)\s+\d+\s+Yd\s+(?:Rush|pass from|Interception Return|Fumble Return|Kickoff Return|Punt Return)\b/i)?.[1]);
    if (scorers.some(n => !n)) return pending('A touchdown scorer is missing or has an unsupported scoring-play format.');
    const first = /\b(?:first TD|1st TD|first touchdown)\b/i.test(text);
    if (first) {
      const ordering = touchdowns.map(p => ({ period: number(p.period?.number), clock: String(p.clock?.displayValue || '').match(/^(\d{1,2}):(\d{2})$/) }));
      if (ordering.some(p => !Number.isFinite(p.period) || !p.clock)) return pending('First-touchdown scoring order cannot be verified.');
      if (ordering.some((p, i) => i > 0 && (p.period < ordering[i - 1].period || (p.period === ordering[i - 1].period && Number(p.clock[1]) * 60 + Number(p.clock[2]) > Number(ordering[i - 1].clock[1]) * 60 + Number(ordering[i - 1].clock[2]))))) return pending('The scoring-play feed is not in verified chronological order.');
      if (!scorers.length) return pending('No touchdown occurred; the sportsbook no-scorer rule is required.');
    }
    const won = (first ? scorers.slice(0, 1) : scorers).some(n => compact(n) === prefix);
    const participation = (summary.boxscore?.players || []).some(t => (t.statistics || []).some(g => (g.athletes || []).some(a => compact(a.athlete?.displayName) === prefix && a.didNotPlay !== true && (a.stats || []).some(value => /^\d+(?:\.\d+)?(?:\/\d+)?$/.test(String(value)) && Number(String(value).split('/')[0]) > 0))));
    if (!won && !participation) return pending('Player participation is unverified; a DNP cannot be graded as a losing touchdown bet.');
    return { result: won ? 'W' : 'L', outcome: first ? `First touchdown: ${scorers[0]}` : `${matches[0]}: ${scorers.filter(n => compact(n) === prefix).length} scored touchdowns (passing TDs excluded)` };
  }
  return null;
}
module.exports = { specialMarketGrade, number, selectedTeam, periodScores };
