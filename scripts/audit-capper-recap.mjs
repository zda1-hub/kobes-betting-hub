import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { readPickLog, pickLogPath, resultFor } = require('../bot/lib/pick-log');
const { reviewQueuePath } = require('../bot/lib/review-queue-path');
const { gradeWagerRows, sourcePacketPath } = require('../bot/lib/wager-ledger');
const { publicationGradeHold, splitRecapBody } = require('../bot/lib/recap-review');
const { gradePickFromEspn, createGradingFetch } = require('../bot/lib/espn-grading');
const { buildCapperRecap } = require('../bot/lib/capper-recap');
const { isPublishedRow } = require('../bot/lib/recap');
const { auditedFetch } = require('../pipeline/api-client');
const { recordGradeAttempt, recordRecapRun } = require('../pipeline/audit-store');
const date = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg));
if (!date) throw new Error('Provide the exact operating date.');
const root = reviewQueuePath();
const directory = path.dirname(pickLogPath());
const attempts = new Map();
const fetchImpl = createGradingFetch();
const grade = async row => {
  const attempt = await gradePickFromEspn(row, { fetchImpl });
  attempts.set(row.pick_id, attempt);
  await recordGradeAttempt({ pickId: row.parent_pick_id || row.pick_id, result: attempt.result || null,
    status: attempt.status, provider: 'ESPN', sourceReference: attempt.source || null,
    snapshot: { ...attempt, wager_id: row.pick_id }, errorDetail: attempt.reason || null });
  return attempt;
};
let rows = (await readPickLog()).filter(row => row.operating_date === date && isPublishedRow(row));
// Do not modify the canonical publication log or race the running worker's
// result ledger. This audit has its own checkpoint file on the persistent disk.
for (const row of rows) {
  const source = sourcePacketPath(root, row.pick_id);
  let packet;
  if (source) {
    try { packet = JSON.parse(await fs.readFile(source, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (publicationGradeHold(row, packet)) continue;
  if (resultFor(row) !== 'PENDING' && row.result_verified_source) continue;
  const attempt = await grade({ ...row, result: 'PENDING' });
  if (attempt.status === 'GRADED' && attempt.source) Object.assign(row, {
    result: attempt.result, status: 'GRADED', score_or_outcome: attempt.outcome,
    result_verified_source: attempt.source, result_verified_at: new Date().toISOString()
  });
}
const wagers = await gradeWagerRows({ rows, date, root,
  file: path.join(directory, `recap-audit-wagers-${date}.json`), grade });
rows = wagers.rows;
for (const [id, attempt] of wagers.attempts) attempts.set(id, attempt);
const recap = buildCapperRecap({ date, rows, attempts });
const report = { date, generatedAt: new Date().toISOString(), total: recap.total, pending: recap.pending,
  rows, attempts: Object.fromEntries(attempts), body: recap.body };
const reportPath = path.join(directory, `capper-recap-audit-${date}.json`);
await fs.writeFile(reportPath, JSON.stringify(report), { mode: 0o600 });
console.log(JSON.stringify({ reportPath, total: recap.total, settled: recap.total - recap.pending, pending: recap.pending,
  unresolved: rows.filter(row => resultFor(row) === 'PENDING').map(row => ({ id: row.pick_id, capper: row.source_name,
    selection: row.selection, reason: attempts.get(row.pick_id)?.reason })) }));
if (process.argv.includes('--email')) {
  const url = (process.env.RECAP_NOTIFICATION_QUEUE_URL || '').replace(/\/$/, '');
  const secret = process.env.RECAP_NOTIFICATION_QUEUE_SECRET;
  const recipient = (process.env.KOBE_RECAP_EMAIL || process.env.KOBE_APPROVAL_EMAIL || '').trim();
  if (!url || !secret || recipient !== 'kobedirwin@gmail.com') throw new Error('Expected Kobe recap email destination is not configured.');
  const hash = createHash('sha256').update(recap.body).digest('hex').slice(0, 20);
  const parts = splitRecapBody(recap.body);
  for (let index = 0; index < parts.length; index++) {
    const id = `capper-recap-audit-${date}-${hash}-${index + 1}`;
    const response = await auditedFetch(`${url}/api/queue/recap-notifications`, { method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, recipient, subject: `Kobe's Betting Hub — ${recap.pending ? 'Private partial' : 'Verified'} capper recap (${date})${parts.length > 1 ? ` ${index + 1}/${parts.length}` : ''}`, body: parts[index] })
    }, { service: 'cloudflare-worker', callerComponent: 'scripts/audit-capper-recap', triggerType: 'owner_requested_recap', workflowId: id });
    if (!response.ok && response.status !== 409) throw new Error(`Recap queue failed: ${response.status}`);
  }
  await recordRecapRun({ operatingDate: date, includedPickIds: recap.includedPickIds,
    status: 'CAPPER_AUDIT_EMAIL_QUEUED', recipient, content: recap.body,
    details: { pending: recap.pending, total: recap.total, parts: parts.length } });
  console.log(JSON.stringify({ email: 'QUEUED', recipient, parts: parts.length, pending: recap.pending }));
}
