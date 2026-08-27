const { createHash } = require('node:crypto');
const { sourceTerms } = require('./source-review');

const MAX_X_POST_LENGTH = 280;

function freePickXPostId(pickId) {
  if (typeof pickId !== 'string' || !pickId.trim()) {
    throw new Error('A Pick ID is required before a free pick can be synced to X.');
  }
  return `free-x-${createHash('sha256').update(pickId).digest('hex').slice(0, 40)}`;
}

function buildFreePickXPost(packet) {
  const terms = sourceTerms(packet);
  if (!terms.length) throw new Error('The free pick has no publishable terms for X.');

  const body = ['FREE PLAY', ...terms, '', 'Live now in the Hub.'].join('\n');
  if (body.length > MAX_X_POST_LENGTH) {
    throw new Error(`The approved free-pick post is ${body.length} characters; X allows ${MAX_X_POST_LENGTH}.`);
  }
  return body;
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

async function syncApprovedFreePickToX(packet, { fetchImpl = fetch, environment = process.env } = {}) {
  const config = freePickXSyncConfig(environment);
  if (!config) return { status: 'disabled' };

  const response = await fetchImpl(`${config.publisherUrl}/api/queue/x`, {
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
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 201 || response.status === 202 || response.status === 409) {
    return { status: response.status === 409 ? 'already_requested' : payload.status || 'requested', postId: payload.id };
  }
  throw new Error(`X free-pick sync failed (${response.status}): ${payload.error || 'Unknown error'}`);
}

module.exports = { buildFreePickXPost, freePickXPostId, freePickXSyncConfig, syncApprovedFreePickToX };
