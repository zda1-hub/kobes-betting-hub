const { createHash } = require('node:crypto');
const { sourceEvidence } = require('./source-review');
const { buildFreePickXPost, freePickXPostId } = require('./free-pick-x');
const { auditedFetch } = require('../../pipeline/api-client');

function remainingEvidence(packet) {
  const evidence = sourceEvidence(packet);
  if (!evidence.length) return [];
  const original = buildFreePickXPost(packet);
  return evidence.filter(claim => !original.split('\n').includes(`- ${claim}`));
}

function breakdownParts(packet) {
  const claims = remainingEvidence(packet);
  if (!claims.length) return [];
  const body = `Full breakdown:\n${claims.map(claim => `• ${claim}`).join('\n')}`;
  if (body.length > 4000)
    throw new Error('The complete breakdown exceeds one X reply. Shorten the approved copy before publishing; do not split it into a thread.');
  return [body];
}

function breakdownReplyId(pickId, parentId) {
  if (!/^\d{1,25}$/.test(parentId)) throw new Error('A confirmed original X post ID is required.');
  const hash = createHash('sha256').update(pickId).digest('hex').slice(0, 20);
  // 00 is reserved for one complete reply; historical 01+ receipts remain untouched.
  return `breakdown-x-${parentId}-${hash}-00`;
}

async function syncApprovedFreePickBreakdown(packet, { environment = process.env, fetchImpl = fetch, operatingDate = packet.operating_date } = {}) {
  const parts = breakdownParts(packet);
  if (!parts.length) return { status: 'published', replies: 0 };
  if (environment.FREE_PICK_X_SYNC_ENABLED !== 'true') return { status: 'disabled', replies: 0 };
  const origin = environment.FREE_PICK_X_PUBLISH_URL?.replace(/\/$/, '');
  const secret = environment.FREE_PICK_X_QUEUE_SECRET;
  if (!origin || !secret) throw new Error('X breakdown publishing requires the configured queue.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operatingDate || '')) throw new Error('The original pick date is required for the X breakdown.');
  const parentResponse = await auditedFetch(`${origin}/api/queue/x/parent?queueId=${freePickXPostId(packet.pick_id)}&date=${operatingDate}`, {
    headers: { authorization: `Bearer ${secret}` },
  }, { service: 'cloudflare-worker', endpointClass: '/api/queue/x/parent', callerComponent: 'bot/lib/free-pick-breakdown', triggerType: 'breakdown_parent_receipt', pickId: packet.pick_id }, fetchImpl);
  if (parentResponse.status === 404) return { status: 'awaiting_original_post', replies: 0 };
  if (!parentResponse.ok) throw new Error(`Original X post lookup failed (${parentResponse.status}).`);
  const parentId = String((await parentResponse.json()).xPostId || '');
  if (!/^\d{1,25}$/.test(parentId)) throw new Error('Original X post has no confirmed ID.');
  const response = await auditedFetch(`${origin}/api/queue/x`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: breakdownReplyId(packet.pick_id, parentId), body: parts[0], scheduledAt: new Date().toISOString(), publishNow: true }),
  }, { service: 'cloudflare-worker', endpointClass: '/api/queue/x', callerComponent: 'bot/lib/free-pick-breakdown', triggerType: 'approved_pick_breakdown', pickId: packet.pick_id }, fetchImpl);
  if (![201, 202, 409].includes(response.status)) throw new Error(`X breakdown reply failed to queue (${response.status}).`);
  const receipt = await response.json().catch(() => ({}));
  if (['failed', 'publishing', 'cancelled'].includes(receipt.status))
    throw new Error(`X breakdown reply needs review (${receipt.status}).`);
  return { status: receipt.status === 'published' ? 'published' : 'pending', replies: 1, published: receipt.status === 'published' ? 1 : 0 };
}

module.exports = { remainingEvidence, breakdownParts, breakdownReplyId, syncApprovedFreePickBreakdown };
