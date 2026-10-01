const { createHash } = require('node:crypto');
const { freeRows, verified } = require('./free-pick-results');
const { resultFor } = require('./pick-log');
const { freePickXPostId } = require('./free-pick-x');
const { auditedFetch } = require('../../pipeline/api-client');

function resultReplyConfig(environment = process.env) {
  if (environment.FREE_PICK_X_RESULT_REPLIES_ENABLED !== 'true') return null;
  const publisherUrl = environment.FREE_PICK_X_PUBLISH_URL?.replace(/\/$/, '');
  const secret = environment.FREE_PICK_X_QUEUE_SECRET;
  const startAt = Date.parse(environment.FREE_PICK_X_RESULT_REPLY_START_AT || '');
  if (!publisherUrl || !secret || !Number.isFinite(startAt)) throw new Error('Result replies require publisher URL, queue secret, and a valid activation timestamp.');
  return { publisherUrl, secret, startAt };
}

function resultReplyId(pickId, xPostId) {
  if (!/^\d{1,25}$/.test(String(xPostId))) throw new Error('A confirmed X post ID is required.');
  const hash = createHash('sha256').update(pickId).digest('hex').slice(0, 20);
  return `result-x-${xPostId}-${hash}`;
}

function buildResultReply(row) {
  if (!verified(row)) throw new Error('The Free Pick result is not verified.');
  const label = { W: 'WIN', L: 'LOSS', P: 'PUSH', V: 'VOID' }[resultFor(row)];
  const wager = [row.selection, row.published_line, row.published_odds_american].map((part) => String(part || '').trim()).filter(Boolean).join(' | ');
  const outcome = String(row.score_or_outcome || '').trim();
  if (!wager || !outcome) throw new Error('A result reply needs the exact wager and final outcome.');
  const body = [`FREE PICK RESULT: ${label}`, wager, `Final: ${outcome}`].join('\n');
  if (body.length > 280) throw new Error('Result reply exceeds X length; review the wager and outcome.');
  return body;
}

async function syncFreePickResultReplies(rows, channelId, { environment = process.env, fetchImpl = fetch } = {}) {
  const config = resultReplyConfig(environment);
  if (!config) return [];
  const receipts = [];
  const eligible = freeRows(rows, channelId).filter((row) => verified(row) && Date.parse(row.result_verified_at) >= config.startAt);
  for (const row of eligible) {
    try {
      const queueId = freePickXPostId(row.pick_id);
      const parent = await auditedFetch(`${config.publisherUrl}/api/queue/x/parent?queueId=${queueId}&date=${row.operating_date}`, {
        headers: { authorization: `Bearer ${config.secret}` },
      }, { service: 'cloudflare-worker', endpointClass: '/api/queue/x/parent', callerComponent: 'bot/lib/free-pick-result-replies', triggerType: 'result_parent_receipt', pickId: row.pick_id }, fetchImpl);
      if (parent.status === 404) { receipts.push({ pickId: row.pick_id, status: 'awaiting_original_post' }); continue; }
      if (!parent.ok) throw new Error(`Original post lookup failed (${parent.status}).`);
      const { xPostId } = await parent.json();
      const body = buildResultReply(row);
      const response = await auditedFetch(`${config.publisherUrl}/api/queue/x`, {
        method: 'POST', headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: resultReplyId(row.pick_id, xPostId), body, scheduledAt: new Date().toISOString(), publishNow: true }),
      }, { service: 'cloudflare-worker', endpointClass: '/api/queue/x', callerComponent: 'bot/lib/free-pick-result-replies', triggerType: 'verified_result_reply', pickId: row.pick_id }, fetchImpl);
      if (![201, 202, 409].includes(response.status)) throw new Error(`Result reply queue failed (${response.status}).`);
      const queued = await response.json().catch(() => ({}));
      if (queued?.status === 'failed') throw new Error('X result reply failed; review the original and delivery log before retrying.');
      receipts.push({ pickId: row.pick_id, status: response.status === 409 ? 'already_requested' : queued?.status || 'requested' });
    } catch (error) {
      receipts.push({ pickId: row.pick_id, status: 'needs_attention', error: String(error.message || error) });
    }
  }
  return receipts;
}

module.exports = { resultReplyConfig, resultReplyId, buildResultReply, syncFreePickResultReplies };
