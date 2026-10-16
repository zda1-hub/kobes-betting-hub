const { createHash } = require('node:crypto');
const { freeRows, verified } = require('./free-pick-results');
const { resultFor } = require('./pick-log');

// Planning only: no network calls, queue mutation, or implied email approval.
// A provider acceptance receipt is required; merely queued picks do not qualify.
function planFreePickResultEmails(rows, deliveries, subscribers, channelId) {
  const picks = new Map(freeRows(rows, channelId).filter(verified).map(row => [row.pick_id, row]));
  const recipients = new Map(subscribers.filter(s => s.subscribed === true && s.resultUpdatesConsent === true)
    .map(s => [String(s.email || '').trim().toLowerCase(), s]));
  const plans = new Map();
  for (const delivery of deliveries) {
    const email = String(delivery.email || '').trim().toLowerCase();
    const row = picks.get(delivery.pickId);
    if (!row || !recipients.has(email) || delivery.status !== 'sent' || !delivery.providerMessageId
      || !Number.isFinite(Date.parse(delivery.sentAt || ''))
      || !Number.isFinite(Date.parse(row.published_at || ''))
      || Date.parse(delivery.sentAt) < Date.parse(row.published_at)
      || Date.parse(delivery.sentAt) > Date.parse(row.result_verified_at)) continue;
    const outcome = String(row.score_or_outcome || '').trim();
    const selection = [row.selection, row.published_line, row.published_odds_american]
      .map(v => String(v || '').trim()).filter(Boolean).join(' | ');
    if (!outcome || !selection || !row.pick_id) continue;
    const id = createHash('sha256').update(`${email}:${row.pick_id}:result`).digest('hex');
    const label = { W: 'WIN', L: 'LOSS', P: 'PUSH', V: 'VOID' }[resultFor(row)];
    plans.set(id, { id, email, pickId: row.pick_id, result: resultFor(row),
      subject: `Free pick result — ${row.operating_date}: ${label}`,
      text: [`The result of the free pick you received: ${label}`, selection, `Final: ${outcome}`,
        `Verified source: ${row.result_verified_source}`, 'Past performance does not guarantee future results.'].join('\n'),
      verifiedAt: row.result_verified_at, requiresUnsubscribeLink: true, status: 'draft' });
  }
  return [...plans.values()];
}
module.exports = { planFreePickResultEmails };
