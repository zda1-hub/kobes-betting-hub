const { recapRows } = require('./recap');
const { resultFor } = require('./pick-log');

const SYMBOLS = { W: '☘️', L: '💥', P: '↔️', V: '🚫', PENDING: '⏳' };

function verifiedResult(row) {
  // A source publication can contain many wagers. Never count its first result
  // as a result for the entire capper post if reconstruction was unavailable.
  const groupedSource = /^(?:\d{8}-\d+(?:-\d+)?-X|tg-\d{8}-\d+-\d+|manual-\d{8}-[a-f0-9]{20})$/.test(row.pick_id);
  if (groupedSource && row.wager_scope !== 'individual') return 'PENDING';
  return row.result_verified_source ? resultFor(row) : 'PENDING';
}

function buildCapperRecap({ date, rows, attempts = new Map() }) {
  const picks = recapRows(rows, date);
  const groups = new Map();
  let pending = 0;
  for (const row of picks) {
    const name = String(row.source_name || 'Source not stated').trim().replace(/[\r\n]+/g, ' ');
    const identity = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!groups.has(identity)) groups.set(identity, { name, wagers: [] });
    groups.get(identity).wagers.push(row);
    if (verifiedResult(row) === 'PENDING') pending++;
  }
  const sections = [];
  for (const { name, wagers } of groups.values()) {
    const counts = { W: 0, L: 0, P: 0, V: 0, PENDING: 0 };
    for (const row of wagers) counts[verifiedResult(row)]++;
    const notes = [counts.P && `${counts.P} push`, counts.V && `${counts.V} void`, counts.PENDING && `${counts.PENDING} pending`].filter(Boolean);
    sections.push(`${name} ${counts.W}-${counts.L}💸${notes.length ? ` (${notes.join(', ')})` : ''}\n\n` + wagers.map(row => {
      const result = verifiedResult(row);
      const selection = String(row.selection || 'Published terms missing').replace(/[\r\n]+/g, ' ');
      return `${selection} ${SYMBOLS[result]}`;
    }).join('\n'));
  }
  const body = [
    `Kobe's Betting Hub — ${date}${pending ? ' — PRIVATE PARTIAL RECAP; NOT FINAL' : ''}`,
    '☘️ Win | 💥 Loss | ↔️ Push | 🚫 Void | ⏳ Pending. Records exclude pushes, voids and pending picks. 💸 is a record label, not a profit claim.',
    ...sections,
    ...(pending ? ['Unresolved picks — do not count or post these as settled:\n' + picks.filter(row => verifiedResult(row) === 'PENDING').map(row => `${row.source_name || 'Source not stated'} | ${row.selection}\n${attempts.get(row.pick_id)?.reason || 'Verified individual-wager result unavailable.'}\n${row.post_reference}`).join('\n\n')] : []),
    'Results use the original published wagers and verified final results. Parlays count as one wager. 21+; gambling involves risk.'
  ].join('\n\n');
  return { body, pending, total: picks.length, includedPickIds: picks.map(row => row.pick_id) };
}

module.exports = { buildCapperRecap, verifiedResult };
