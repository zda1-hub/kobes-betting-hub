// Bounded, source-backed review for a published wager absent from the normal
// provider feed. Identity and original terms must match exactly; never apply
// an outcome by player name alone or to a later match.
const evidence = Object.freeze([
  Object.freeze({
    pickId: 'tg-20260917-3593544389-27786',
    date: '2026-09-17',
    selection: 'Victoria Kasintseva ML',
    result: 'L',
    outcome: 'Victoria Jimenez Kasintseva lost to Francisca Jorge 2–6, 6–4, 4–6; completed Caldas da Rainha round of 16 on September 17, 2026.',
    source: 'https://www.wtatennis.com/tournaments/1136/caldas-da-rainha-125/2026/scores/LS015',
    verifiedAt: '2026-09-18T16:18:00Z'
  })
]);

function reviewedAdjudication(row) {
  const record = evidence.find(item => item.pickId === row.pick_id && item.date === row.operating_date && item.selection === row.selection);
  if (!record || row.market && !/^(?:moneyline|ML)$/i.test(row.market)) return null;
  return { status: 'GRADED', result: record.result, outcome: record.outcome, source: record.source };
}

module.exports = { reviewedAdjudication };
