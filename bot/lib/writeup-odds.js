// Near-even American odds for VIP writeups. This is a selection rule, never
// permission to replace the source's published price with a different one.
function nearEvenAmericanOdds(value) {
  const match = String(value ?? '').trim().replaceAll('−', '-').match(/^([+-])(\d{3,4})$/);
  if (!match) return false;
  const magnitude = Number(match[2]);
  return magnitude >= 100 && magnitude <= 200;
}

function assertWriteupOdds(packet) {
  const extraction = packet?.analysis?.extraction || {};
  const plays = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays : [extraction];
  if (plays.some((play) => !nearEvenAmericanOdds(play.odds_american))) {
    throw new Error('VIP writeups require verified, source-stated odds between -200 and +200. Do not alter the published odds; choose a different play.');
  }
}

module.exports = { nearEvenAmericanOdds, assertWriteupOdds };
