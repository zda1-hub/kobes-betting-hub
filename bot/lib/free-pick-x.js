const { createHash } = require('node:crypto');
const { sourceEvidence, sourceTerms } = require('./source-review');
const { auditedFetch } = require('../../pipeline/api-client');

const MAX_X_POST_LENGTH = 280;
const MAX_X_EVIDENCE_POINTS = 4;
const X_HEADER = '🚨 TODAY’S FREE PLAY';
const X_ENGAGEMENT = 'WHO’S RIDING WITH THE HUB? 👀';
const X_CTA = 'Full board → kobesbettinghub.com/join\n21+ | Bet responsibly. No guarantees.';

function freePickXPostId(pickId) {
  if (typeof pickId !== 'string' || !pickId.trim()) {
    throw new Error('A Pick ID is required before a free pick can be synced to X.');
  }
  return `free-x-${createHash('sha256').update(pickId).digest('hex').slice(0, 40)}`;
}

function buildFreePickXPost(packet) {
  const terms = sourceTerms(packet);
  if (!terms.length) throw new Error('The free pick has no publishable terms for X.');

  // Exact approved wager terms are mandatory. Verified evidence is optional
  // and is added only as complete bullets; a claim is never shortened into a
  // potentially misleading fragment just to fit X's character limit.
  const fixedSections = [X_HEADER, terms.join('\n'), X_ENGAGEMENT, X_CTA];
  let body = fixedSections.join('\n\n');
  if (body.length > MAX_X_POST_LENGTH) {
    body = [X_HEADER, terms.join('\n'), X_CTA].join('\n\n');
  }
  if (body.length > MAX_X_POST_LENGTH) {
    throw new Error(`The approved free-pick post is ${body.length} characters before evidence; X allows ${MAX_X_POST_LENGTH}.`);
  }

  const evidence = sourceEvidence(packet).slice(0, MAX_X_EVIDENCE_POINTS);
  const acceptedEvidence = [];
  for (const claim of evidence) {
    const candidateEvidence = [...acceptedEvidence, `• ${claim}`];
    const candidate = [X_HEADER, terms.join('\n'), candidateEvidence.join('\n'), X_ENGAGEMENT, X_CTA].join('\n\n');
    if (candidate.length <= MAX_X_POST_LENGTH) acceptedEvidence.push(`• ${claim}`);
  }

  return acceptedEvidence.length
    ? [X_HEADER, terms.join('\n'), acceptedEvidence.join('\n'), X_ENGAGEMENT, X_CTA].join('\n\n')
    : body;
}

function freePickXSyncConfig(environment = process.env) {
  if (environment.FREE_PICK_X_SYNC_ENABLED !== 'true') return null;
  const publisherUrl = environment.FREE_PICK_X_PUBLISH_URL?.replace(/\/$/, '');
  const secret = environment.FREE_PICK_X_QUEUE_SECRET;
  if (!publisherUrl || !secret) {
    throw new Error('FREE_PICK_X_SYNC_ENABLED requires FREE_PICK_X_PUBLISH_URL and FREE_PICK_X_QUEUE_SECRET.');
  }
  return { publisherUrl, secret };
}

function shouldRunTextXFallback(siteSync) {
  return siteSync?.xPosted !== true;
}

async function syncApprovedFreePickToX(packet, { fetchImpl = fetch, environment = process.env } = {}) {
  const config = freePickXSyncConfig(environment);
  if (!config) return { status: 'disabled' };

  const response = await auditedFetch(`${config.publisherUrl}/api/queue/x`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.secret}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      id: freePickXPostId(packet.pick_id),
      body: buildFreePickXPost(packet),
      scheduledAt: new Date().toISOString(),
      publishNow: true
    })
  }, {
    service: 'cloudflare-worker',
    endpointClass: '/api/queue/x',
    callerComponent: 'bot/lib/free-pick-x',
    triggerType: 'approved_pick_sync',
    workflowId: packet.pick_id,
    pickId: packet.pick_id
  }, fetchImpl);
  const payload = await response.json().catch(() => ({}));
  if (payload.status === 'failed' || payload.status === 'publishing') {
    throw new Error(`X delivery needs review (${payload.status}); do not submit a new post ID.`);
  }
  if (response.status === 201 || response.status === 202 || response.status === 409) {
    return { status: response.status === 409 ? 'already_requested' : payload.status || 'requested', postId: payload.id, xPostId: payload.xPostId || null };
  }
  throw new Error(`X free-pick sync failed (${response.status}): ${payload.error || 'Unknown error'}`);
}

async function readFreePickXReceipt(packet, { fetchImpl = fetch, environment = process.env } = {}) {
  const config = freePickXSyncConfig(environment);
  if (!config) return { status: 'disabled' };
  const response = await auditedFetch(`${config.publisherUrl}/api/queue/x`, {
    headers: { authorization: `Bearer ${config.secret}` }
  }, { service: 'cloudflare-worker', endpointClass: '/api/queue/x', callerComponent: 'bot/lib/free-pick-x', triggerType: 'delivery_receipt', pickId: packet.pick_id }, fetchImpl);
  if (!response.ok) throw new Error(`Cannot verify X delivery receipt (${response.status}).`);
  const payload = await response.json();
  return payload.posts?.find((post) => post.id === freePickXPostId(packet.pick_id)) || { status: 'not_requested' };
}

module.exports = { buildFreePickXPost, freePickXPostId, freePickXSyncConfig, shouldRunTextXFallback, syncApprovedFreePickToX, readFreePickXReceipt };
