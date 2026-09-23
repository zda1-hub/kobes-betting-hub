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

function wagerIdentity(row) {
  // A copied/re-posted selection is one capper call, not a fresh win. Keep
  // the price and stake in the identity so genuinely changed terms are not
  // silently collapsed.
  return [row.selection, row.published_line, row.published_odds_american,
    row.units_risked, row.event, row.market]
    .map(value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()).join('\u001f');
}

function distinctCapperWagers(rows) {
  const unique = new Map();
  for (const row of rows) {
    const identity = wagerIdentity(row);
    const previous = unique.get(identity);
    if (!previous) {
      unique.set(identity, { row, sources: [row] });
      continue;
    }
    previous.sources.push(row);
    const priorGrade = verifiedResult(previous.row);
    const grade = verifiedResult(row);
    if (priorGrade !== 'PENDING' && grade !== 'PENDING' && priorGrade !== grade) {
      // Conflicting grades of identical terms require human reconciliation.
      previous.row = { ...previous.row, result: 'PENDING', result_verified_source: '' };
      previous.conflicting = true;
    } else if (!previous.conflicting && priorGrade === 'PENDING' && grade !== 'PENDING') {
      previous.row = row;
    }
  }
  return [...unique.values()];
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
  }
  const sections = [];
  const reviews = [];
  const uniquePicks = [];
  let total = 0;
  for (const { name, wagers: listed } of groups.values()) {
    const entries = distinctCapperWagers(listed);
    const wagers = entries.map(entry => entry.row);
    uniquePicks.push(...wagers);
    const repeated = listed.length - wagers.length;
    const counts = { W: 0, L: 0, P: 0, V: 0, PENDING: 0 };
    for (const row of wagers) counts[verifiedResult(row)]++;
    pending += counts.PENDING;
    total += wagers.length;
    const notes = [counts.P && `${counts.P} push`, counts.V && `${counts.V} void`, counts.PENDING && `${counts.PENDING} pending`].filter(Boolean);
    const body = `${name} ${counts.W}-${counts.L}💸${notes.length ? ` (${notes.join(', ')})` : ''}\n\n` + wagers.map(row => {
      const result = verifiedResult(row);
      const selection = String(row.selection || 'Published terms missing').replace(/[\r\n]+/g, ' ');
      return `${selection} ${SYMBOLS[result]}`;
    }).join('\n') + (repeated ? `\n\n${repeated} identical reposted listing${repeated === 1 ? '' : 's'} excluded from this record.` : '');
    sections.push(body);
    reviews.push({ name, body, pending: counts.PENDING, total: wagers.length,
      includedPickIds: listed.map(row => row.pick_id),
      evidence: entries.map(entry => entry.sources.map(row => [row.pick_id, verifiedResult(row), row.result_verified_source, row.post_reference])) });
  }
  const body = [
    `Kobe's Betting Hub — ${date}${pending ? ' — PRIVATE PARTIAL RECAP; NOT FINAL' : ''}`,
    '☘️ Win | 💥 Loss | ↔️ Push | 🚫 Void | ⏳ Pending. Records exclude pushes, voids and pending picks. 💸 is a record label, not a profit claim.',
    ...sections,
    ...(pending ? ['Unresolved picks — do not count or post these as settled:\n' + uniquePicks.filter(row => verifiedResult(row) === 'PENDING').map(row => `${row.source_name || 'Source not stated'} | ${row.selection}\n${attempts.get(row.pick_id)?.reason || 'Verified individual-wager result unavailable.'}\n${row.post_reference}`).join('\n\n')] : []),
    'Results use the original published wagers and verified final results. Parlays count as one wager. 21+; gambling involves risk.'
  ].join('\n\n');
  return { body, pending, total, includedPickIds: picks.map(row => row.pick_id), reviews };
}

function buildOverallRecap({ date, rows }) {
  const picks = recapRows(rows, date);
  const entries = distinctCapperWagers(picks);
  const wagers = entries.map(entry => entry.row);
  const counts = { W: 0, L: 0, P: 0, V: 0, PENDING: 0 };
  for (const row of wagers) counts[verifiedResult(row)]++;
  const notes = [counts.P && `${counts.P} push`, counts.V && `${counts.V} void`, counts.PENDING && `${counts.PENDING} pending`].filter(Boolean);
  const body = `Overall record ${counts.W}-${counts.L}${notes.length ? ` (${notes.join(', ')})` : ''}\n\n`
    + wagers.map(row => `${String(row.selection || 'Published terms missing').replace(/[\r\n]+/g, ' ')} ${SYMBOLS[verifiedResult(row)]}`).join('\n');
  return { body, pending: counts.PENDING, total: wagers.length, includedPickIds: picks.map(row => row.pick_id), reviews: [{
    name: 'Overall', body, pending: counts.PENDING, total: wagers.length,
    includedPickIds: picks.map(row => row.pick_id),
    evidence: entries.map(entry => entry.sources.map(row => [row.pick_id, verifiedResult(row), row.result_verified_source, row.post_reference]))
  }] };
}

module.exports = { buildCapperRecap, buildOverallRecap, distinctCapperWagers, verifiedResult };
