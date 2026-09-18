const { isPublishedRow } = require('./recap');
const { resultFor } = require('./pick-log');
const { buildCapperRecap } = require('./capper-recap');

// Stay below the existing 12 KiB notification limit without silently truncating.
const MAX_BODY = 11000;
function publicationGradeHold(row, packet) {
  if (!/^(?:\d{8}-\d+(?:-\d+)?-X|tg-\d{8}-\d+-\d+|manual-\d{8}-[a-f0-9]{20})$/.test(row.pick_id)) return '';
  if (!packet) return 'Original publication packet unavailable; verify wager scope before grading.';
  if (packet.pick_id !== row.pick_id) return 'Original publication packet identity mismatch; verify manually.';
  if ((packet.analysis?.extraction?.plays || []).length > 1) return 'Multi-wager publication group requires per-wager verified grading; first-wager-only grading is blocked.';
  return '';
}
function splitRecapBody(body, limit = MAX_BODY) {
  if (!Number.isSafeInteger(limit) || limit < 100) throw new Error('Invalid recap body limit.');
  const parts = [];
  let remaining = String(body);
  while (remaining.length > limit) {
    const boundary = remaining.lastIndexOf('\n', limit);
    const end = boundary > limit / 2 ? boundary + 1 : limit;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function buildRecapReview({ date, rows, attempts = new Map() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid operating date.');
  const published = rows.filter(row => row.operating_date === date && isPublishedRow(row));
  const pending = published.filter(row => resultFor(row) === 'PENDING');
  if (!pending.length) return null;
  const verified = published.filter(row => resultFor(row) !== 'PENDING' && row.result_verified_source);
  const lines = [
    `PRIVATE RECAP REVIEW — ${date} — NOT A FINAL RECAP`,
    `${published.length} official recap entries; ${verified.length} verified settled entries; ${pending.length} unresolved entries.`,
    published.every(row => row.wager_scope === 'individual')
      ? 'Each entry represents one published wager; parlays remain one wager. Unresolved results are excluded from the settled record.'
      : 'An entry may contain several wagers. These counts are NOT an individual-wager win/loss record or ROI.',
    'No overall profit or final record is claimed. Open each Discord post for the complete published wager group.',
    'Verified results:',
    ...verified.map(row => `${row.pick_id} | ${row.source_name || 'Source not stated'} | ${resultFor(row)} | ${row.selection}\nVerification: ${row.result_verified_source}\n${row.post_reference}`),
    ...(verified.length ? [] : ['No verified settled results yet.']),
    'Unresolved entries — verify exact terms and results before grading:',
    ...pending.map(row => `${row.pick_id} | ${row.source_name || 'Source not stated'} | ${row.selection}\nReason: ${attempts.get(row.pick_id)?.reason || 'Verified result not available.'}\n${row.post_reference}`),
    'Only grade against the exact published wager(s), with a trustworthy result source. Do not grade a multi-wager group from its first wager alone.',
    'The cloud worker continues checking supported markets and queues the complete final recap after every eligible entry is verified. Kobe reviews before public posting.'
  ];
  return { includedPickIds: published.map(row => row.pick_id), parts: splitRecapBody(buildCapperRecap({ date, rows, attempts }).body + '\n\nPRIVATE VERIFICATION AUDIT\n\n' + lines.join('\n\n')) };
}

module.exports = { buildRecapReview, publicationGradeHold, splitRecapBody };
