'use strict';
// Pure research calculations. No model probabilities or bet execution.
const SPORTS = ['NBA', 'NFL', 'NCAAF', 'NCAAB', 'MLB', 'NHL', 'WNBA', 'SOCCER'];
function impliedProbability(odds) {
  if (!Number.isFinite(odds) || Math.abs(odds) < 100) throw new Error('Invalid American odds');
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}
function summarize(logs, { stat, line, side = 'over', season, limit }) {
  if (!Number.isFinite(line) || !['over', 'under', 'at_least'].includes(side)) throw new Error('Invalid line');
  const ids = new Set();
  const games = logs.filter(g => {
    if (ids.has(g.gameId)) throw new Error('Duplicate game log');
    ids.add(g.gameId);
    return g.status === 'final' && g.participated === true && (!season || g.season === season) && Number.isFinite(g.stats?.[stat]);
  }).sort((a,b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, limit);
  const values = games.map(g => g.stats[stat]);
  const hits = values.filter(v => side === 'over' ? v > line : side === 'under' ? v < line : v >= line).length;
  const pushes = side === 'at_least' ? 0 : values.filter(v => v === line).length;
  return { hits, pushes, sample: values.length, hitRate: values.length ? hits / values.length : null,
    average: values.length ? values.reduce((a,b)=>a+b,0)/values.length : null,
    games: games.map(g=>({gameId:g.gameId,date:g.date,value:g.stats[stat]})) };
}
function analyze(logs, query) {
  return { season: summarize(logs, query), l5: summarize(logs,{...query,limit:5}),
    l10:summarize(logs,{...query,limit:10}),l20:summarize(logs,{...query,limit:20}),
    methodology:'Final participated games with observed stats only. Pushes remain in denominator and are not hits. Historical frequency is not next-game probability.' };
}
function fresh(timestamp, now, maxAge) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time <= now && now-time <= maxAge;
}
function qualify(prop, analysis, { now=Date.now(), maxOddsAgeMs=300000, maxRosterAgeMs=86400000, minSample=20, minHitRate=.8, allowPreGameAvailabilityCheck=false }={}) {
  const reasons=[];
  if (!SPORTS.includes(prop.sport)) reasons.push('unsupported sport');
  if (!prop.available || !prop.source || !prop.sportsbook) reasons.push('unverified market');
  if (!fresh(prop.updatedAt,now,maxOddsAgeMs)) reasons.push('stale odds');
  if (!prop.teamId || !prop.opponentId || prop.rosterVerified !== true || !fresh(prop.rosterVerifiedAt,now,maxRosterAgeMs)) reasons.push('unverified roster');
  if (prop.participationVerified !== true && !(allowPreGameAvailabilityCheck && prop.preGameAvailabilityChecked === true)) reasons.push('unverified participation');
  if (!Number.isFinite(Date.parse(prop.startsAt)) || Date.parse(prop.startsAt)<=now) reasons.push('game started or unknown');
  try { impliedProbability(prop.odds); if(prop.odds < -400) reasons.push('price worse than -400'); } catch { reasons.push('invalid odds'); }
  const sportMinimum = prop.sport === 'NFL' ? 8 : minSample;
  if (analysis.season.sample<sportMinimum) reasons.push('insufficient season sample');
  if (analysis.season.hitRate === null || analysis.season.hitRate<minHitRate) reasons.push('season hit rate below threshold');
  // Reliability score intentionally uses all windows, never calls it a probability.
  const windows=[analysis.season,analysis.l5,analysis.l10,analysis.l20];
  const score=windows.every(w=>w.hitRate!==null) ? .55*analysis.season.hitRate+.1*analysis.l5.hitRate+.15*analysis.l10.hitRate+.2*analysis.l20.hitRate : 0;
  return { qualifies:reasons.length===0,reasons,consistencyScore:score };
}
function combinationWarnings(legs) {
  const warnings=[]; const ids=new Set();
  for(const leg of legs){if(ids.has(leg.id))warnings.push('Duplicate selection');ids.add(leg.id);}
  if(legs.some((a,i)=>legs.slice(i+1).some(b=>a.gameId && a.gameId===b.gameId))) warnings.push('Shared game: selections may be correlated');
  if(legs.some((a,i)=>legs.slice(i+1).some(b=>a.playerId && a.playerId===b.playerId))) warnings.push('Shared player: selections may overlap or conflict');
  return { warnings:[...new Set(warnings)], combinedProbability:null, combinedPayout:null, explanation:'Combined probability and payout unavailable without dependency-aware modeling and sportsbook pricing.' };
}
module.exports={SPORTS,impliedProbability,summarize,analyze,qualify,combinationWarnings};
