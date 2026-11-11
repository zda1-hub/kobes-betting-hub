const QUEUED = new Set(['QUEUED', 'ALREADY_QUEUED']);
// Waiting notices are one notification per operating date, not one per changing
// pending set. Existing delivery evidence survives internal grading updates.
function planPendingRecapNotice({ date, pendingIds, previous = {} }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid recap operating date.');
  const alreadyQueued = Boolean(previous.notified_at) && QUEUED.has(previous.email_status);
  return {
    id: `free-recap-pending-${date}`,
    shouldQueue: !alreadyQueued,
    state: { ...previous, status: 'PENDING_RESULTS', pending_ids: pendingIds }
  };
}
function queuedPendingRecapNotice(plan, emailStatus, notifiedAt) {
  if (!QUEUED.has(emailStatus)) throw new Error('Pending recap notice queue not confirmed.');
  return { ...plan.state, notified_at: notifiedAt, email_status: emailStatus };
}
module.exports = { planPendingRecapNotice, queuedPendingRecapNotice };
