const { createHash } = require('node:crypto');
const { sourceEvidence } = require('./source-review');
const { buildFreePickXPost, freePickXPostId, safeXPostLength } = require('./free-pick-x');
const { auditedFetch } = require('../../pipeline/api-client');

function remainingEvidence(packet) {
  const evidence = sourceEvidence(packet);
  if (!evidence.length) return [];
  const original = buildFreePickXPost(packet);
  return evidence.filter(claim => !original.split('\n').includes(`- ${claim}`));
}

function breakdownParts(packet) {
  const chunks = [];
  for (const claim of remainingEvidence(packet)) {
    const words = claim.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (safeXPostLength(`More on this pick (20/20):\n${next}`) > 280 && current) {
        chunks.push(current);
        current = word;
      } else current = next;
      if (safeXPostLength(`More on this pick (20/20):\n${current}`) > 280)
        throw new Error('An approved breakdown word is too long for an X reply.');
    }
    if (current) chunks.push(current);
  }
  if (chunks.length > 20) throw new Error('The approved breakdown needs more than 20 X replies.');
  return chunks.map((text, index) => `More on this pick (${index + 1}/${chunks.length}):\n${text}`);
}

function breakdownReplyId(pickId, parentId, index) {
  if (!/^\d{1,25}$/.test(parentId)) throw new Error('A confirmed original X post ID is required.');
  const hash = createHash('sha256').update(pickId).digest('hex').slice(0, 20);
  return `breakdown-x-${parentId}-${hash}-${String(index + 1).padStart(2, '0')}`;
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
  let published = 0;
  for (const [index, body] of parts.entries()) {
    const id = breakdownReplyId(packet.pick_id, parentId, index);
    const response = await auditedFetch(`${origin}/api/queue/x`, {
      method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id, body, scheduledAt: new Date().toISOString(), publishNow: true }),
    }, { service: 'cloudflare-worker', endpointClass: '/api/queue/x', callerComponent: 'bot/lib/free-pick-breakdown', triggerType: 'approved_pick_breakdown', pickId: packet.pick_id }, fetchImpl);
    if (![201, 202, 409].includes(response.status)) throw new Error(`X breakdown reply ${index + 1} failed to queue (${response.status}).`);
    const receipt = await response.json().catch(() => ({}));
    if (['failed', 'publishing', 'cancelled'].includes(receipt.status))
      throw new Error(`X breakdown reply ${index + 1} needs review (${receipt.status}).`);
    if (receipt.status === 'published') published++;
    else break; // Keep the approved points in order across publisher retries.
  }
  return { status: published === parts.length ? 'published' : 'pending', replies: parts.length, published };
}

module.exports = { remainingEvidence, breakdownParts, breakdownReplyId, syncApprovedFreePickBreakdown };
