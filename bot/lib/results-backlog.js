const fs = require('node:fs/promises');
const path = require('node:path');
const { publicResultRows } = require('./public-result-rows');
const { gradeWagerRows } = require('./wager-ledger');
const { verified } = require('./free-pick-results');
const { resultFor, netUnitsFor } = require('./pick-log');

// Recover older outcomes without publishing messages or changing wager terms.
// The caller serializes this with the normal daily recap grader.
async function recoverResultsBacklog({ rows, beforeDate, root, directory, grade,
  updatePick, onAttempt = async () => {}, limit = 50, cursor = 0, now = Date.now }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate || '') || !Number.isFinite(Date.parse(beforeDate))) throw new Error('Invalid backlog cutoff date.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Backlog limit must be an integer from 1 to 100.');
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Backlog cursor must be a nonnegative integer.');
  if (typeof grade !== 'function' || typeof updatePick !== 'function') throw new Error('Backlog requires grading and canonical update callbacks.');
  const expanded = await publicResultRows({ rows, root, directory });
  const pending = expanded.filter(row => row.operating_date < beforeDate && !verified(row));
  const ordered = [...pending].sort((a,b) => a.pick_id.localeCompare(b.pick_id));
  const selected = new Set();
  for (let i = 0; i < Math.min(limit, ordered.length); i++) selected.add(ordered[(cursor + i) % ordered.length].pick_id);
  const dates = [...new Set(ordered.filter(row => selected.has(row.pick_id)).map(row => row.operating_date))];
  const selectedSingles = new Set(ordered.filter(row => selected.has(row.pick_id) && row.wager_scope === 'individual' && !row.parent_pick_id).map(row => row.pick_id));
  const eligible = row => selected.has(row.pick_id) || (row.pick_id === `${row.parent_pick_id}-W001` && selectedSingles.has(row.parent_pick_id));
  const deadline = now() + 60000;
  const attempts = [];
  const boundedGrade = async row => {
    if (!eligible(row) || now() >= deadline) return { status: 'PENDING', reason: 'Outside this bounded recovery batch.' };
    const attempt = await grade(row);
    attempts.push({ id: row.pick_id, date: row.operating_date, selection: row.selection,
      postUrl: row.post_reference, ...attempt });
    await onAttempt(row.parent_pick_id || row.pick_id, row.pick_id, attempt);
    return attempt;
  };
  for (const date of dates) {
    const wagers = await gradeWagerRows({ rows, date, root,
      file: path.join(directory, `wager-results-${date}.json`), grade: boundedGrade });
    for (const row of wagers.rows) {
      if (wagers.attempts.has(row.pick_id) || !selected.has(row.pick_id) || row.parent_pick_id || row.wager_scope !== 'individual' || resultFor(row) !== 'PENDING') continue;
      const attempt = await boundedGrade(row);
      if (attempt.status !== 'GRADED' || !['W','L','P','V'].includes(attempt.result) || !attempt.source) continue;
      const patch = { result: attempt.result, status: 'GRADED', score_or_outcome: attempt.outcome,
        result_verified_source: `Verified final result: ${attempt.source}`,
        result_verified_at: new Date().toISOString(), graded_by: 'recovery:primary-source' };
      const net = netUnitsFor({ ...row, ...patch });
      if (net !== null) patch.net_units = net;
      await updatePick(row.pick_id, patch);
    }
  }
  const report = { generatedAt: new Date().toISOString(), beforeDate,
    pendingBefore: pending.length, selected: selected.size, attempted: attempts.length,
    recovered: attempts.filter(a => a.status === 'GRADED' && ['W','L','P','V'].includes(a.result) && a.source).length,
    nextCursor: ordered.length ? (cursor + selected.size) % ordered.length : 0, attempts };
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'results-backlog-last-run.json'), JSON.stringify(report), { mode: 0o600 });
  return report;
}

module.exports = { recoverResultsBacklog };
