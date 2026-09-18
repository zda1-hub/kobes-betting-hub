const { number } = require('./espn-special-markets');
function compact(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function localDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function matchTennisCompetition(row, feeds) {
  const prefix = String(row.selection || '').match(/^(.+?)\s+(?:ML|moneyline|[+-]\d+(?:\.\d+)?)(?=\s|$)/i)?.[1]?.trim();
  if (!prefix) return null;
  const identity = compact(prefix);
  const candidates = [];
  for (const { tour, payload } of feeds) for (const event of payload.events || []) {
    for (const competition of [...(event.competitions || []), ...(event.groupings || []).flatMap(g => g.competitions || [])]) {
      // A tournament scoreboard includes matches outside the requested date.
      if (localDate(competition.date) !== row.operating_date || !/singles/i.test(competition.type?.text || '') || competition.competitors?.length !== 2) continue;
      const matches = competition.competitors.filter(c => {
        const name = c.athlete?.displayName || '';
        return compact(name) === identity || (!/\s/.test(prefix) && identity.length >= 5 && compact(name.split(' ').at(-1)) === identity);
      });
      if (matches.length !== 1) continue;
      const opponent = competition.competitors.find(c => c !== matches[0]);
      if (row.event) {
        const identity = compact(row.event);
        if (![matches[0], opponent].every(c => [c.athlete?.displayName, c.athlete?.displayName?.split(' ').at(-1)].map(compact).filter(n => n.length >= 5).some(n => identity.includes(n)))) continue;
      }
      const vs = String(row.selection || '').match(/\bvs\.?\s+(.+?)(?=\s+[+-]\d{3,4}|\s*\(|$)/i)?.[1];
      if (vs && ![opponent.athlete?.displayName, opponent.athlete?.displayName?.split(' ').at(-1)].map(compact).includes(compact(vs))) continue;
      candidates.push({ tour, event, competition, player: matches[0], opponent });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}
function gradeTennisMatch(row, match) {
  if (!match) return { status: 'PENDING', reason: 'No unique same-day singles match with the exact player/opponent was found.' };
  const { competition, player, opponent, tour, event } = match;
  const status = competition.status?.type;
  if (!status?.completed) return { status: 'PENDING', reason: 'The ESPN event is not final.' };
  if (status.name !== 'STATUS_FINAL' || /retir|walkover|default|abandon|cancel/i.test(JSON.stringify({ status, notes: competition.notes }))) return { status: 'PENDING', reason: 'Tennis retirement/walkover settlement requires the original sportsbook rules.' };
  const a = player.linescores || [], b = opponent.linescores || [];
  if (!a.length || a.length !== b.length || a.some((p,i) => !Number.isFinite(number(p.value ?? p.displayValue)) || !Number.isFinite(number(b[i].value ?? b[i].displayValue)) || typeof p.winner !== 'boolean' || typeof b[i].winner !== 'boolean' || p.winner === b[i].winner)) return { status: 'PENDING', reason: 'Complete final set scores and set winners are required.' };
  const standardSets = a.every((p,i) => {
    const x=number(p.value ?? p.displayValue), y=number(b[i].value ?? b[i].displayValue);
    const winning=p.winner?x:y, losing=p.winner?y:x;
    return winning===6 && losing<=4 || winning===7 && [5,6].includes(losing);
  });
  const wins=a.filter(p=>p.winner).length, losses=b.filter(p=>p.winner).length;
  if (!standardSets || Math.max(wins,losses)<2 || wins===losses || (player.winner===true)!==(wins>losses)) return { status:'PENDING', reason:'Nonstandard or incomplete tennis sets require verified sportsbook settlement.' };
  const source = `https://www.espn.com/tennis/scoreboard/_/league/${tour}/date/${row.operating_date.replaceAll('-', '')}`;
  const name = player.athlete.displayName;
  if (/\b(?:ML|moneyline)\b/i.test(row.selection)) {
    if (typeof player.winner !== 'boolean' || typeof opponent.winner !== 'boolean' || player.winner === opponent.winner) return { status: 'PENDING', reason: 'The final tennis winner is not verified.' };
    return { status: 'GRADED', result: player.winner ? 'W' : 'L', outcome: `${name} ${a.filter(p=>p.winner).length}–${b.filter(p=>p.winner).length} sets; match ${competition.id}, ${event.name}`, source };
  }
  const line = Number(row.selection.match(/\s([+-]\d{1,2}(?:\.\d+)?)(?=\s|$)/)?.[1]);
  if (!Number.isFinite(line)) return { status: 'PENDING', reason: 'No original tennis handicap line was found.' };
  const sets = /\bsets?\b/i.test(row.selection);
  // A bare tennis handicap is conventionally games; unknown tiebreak-as-game
  // rules remain held if a match tiebreak replaces the deciding set.
  if (a.some((p,i)=>number(p.value ?? p.displayValue)>7 || number(b[i].value ?? b[i].displayValue)>7)) return { status: 'PENDING', reason: 'A deciding match tiebreak requires the sportsbook handicap rules.' };
  const actual = sets ? a.filter(p=>p.winner).length - b.filter(p=>p.winner).length : a.reduce((sum,p,i)=>sum+number(p.value ?? p.displayValue)-number(b[i].value ?? b[i].displayValue),0);
  return { status: 'GRADED', result: actual + line === 0 ? 'P' : actual + line > 0 ? 'W' : 'L', outcome: `${name}: ${actual} ${sets?'set':'game'} differential (${line > 0 ? '+' : ''}${line}); match ${competition.id}, ${event.name}`, source };
}
module.exports = { matchTennisCompetition, gradeTennisMatch, localDate };
