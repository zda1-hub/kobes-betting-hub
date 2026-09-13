const DEFAULT_PUBLISHER_URL = 'https://bettinghub-publisher.kobedirwin.workers.dev';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const { publicPickTerms, sourceEvidence } = require('./source-review');
const { auditedFetch } = require('../../pipeline/api-client');

function phoenixOperatingDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function siteConfig(environment = process.env) {
  const url = (environment.FREE_PICK_SITE_PUBLISH_URL || DEFAULT_PUBLISHER_URL).replace(/\/$/, '');
  const secret = environment.FREE_PICK_SITE_PUBLISH_SECRET || environment.DAILY_PICKS_QUEUE_SECRET;
  if (!secret) return null;
  return { url, secret };
}

function shouldUseStandaloneXSync(siteSync) {
  // The Publisher Worker attempts X itself whenever it accepts an image.
  // A partial 202 still counts as handled here: enqueueing the text path after
  // that response could turn one approved pick into two separate X posts.
  return !siteSync?.image;
}

function manualFreePickPacket(pickId, options) {
  const evidence = String(options.evidence || '')
    .split(/[;\n]/)
    .map((item) => item.trim().replace(/^•\s*/, ''))
    .filter(Boolean);
  const play = {
    selection: options.pick || '',
    line: options.publishedLine || '',
    odds_american: options.publishedOdds === undefined || options.publishedOdds === null ? '' : String(options.publishedOdds),
    units: options.unitsRisked === undefined || options.unitsRisked === null ? '' : String(options.unitsRisked),
    event: options.event || '',
  };
  return {
    pick_id: pickId,
    approval: { image_url: options.imageAttachmentUrl || options.imageUrl || null },
    analysis: {
      extraction: {
        sport: options.sport || '',
        event: options.event || '',
        source_claims: evidence,
        plays: [play],
      },
    },
  };
}

async function publishApprovedFreePickToSite(packet, { fetchImpl = fetch, environment = process.env } = {}) {
  const config = siteConfig(environment);
  if (!config) return { status: 'disabled' };

  const extraction = packet.analysis?.extraction || {};
  const firstPlay = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays[0] : extraction;
  const details = {
    sport: extraction.sport || '',
    event: extraction.event || '',
    selection: firstPlay.selection || extraction.selection || '',
    line: firstPlay.line || extraction.line || '',
    odds: firstPlay.odds_american || extraction.odds_american || '',
    units: firstPlay.units || extraction.units || '',
    reason: sourceEvidence(packet).join(' • '),
  };
  const caption = ['FREE PLAY', ...publicPickTerms(packet)].join('\n').slice(0, 280);
  const imageUrl = packet.approval?.image_url;
  let response;

  if (imageUrl) {
    try {
      const imageResponse = await auditedFetch(imageUrl, {}, {
        service: 'source-media',
        endpointClass: '/source-media',
        callerComponent: 'bot/lib/free-pick-site',
        triggerType: 'approved_pick_sync',
        workflowId: packet.pick_id,
        pickId: packet.pick_id
      }, fetchImpl);
      if (!imageResponse.ok) throw new Error(`approved image returned HTTP ${imageResponse.status}`);
      const type = (imageResponse.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      const extension = IMAGE_EXTENSIONS.get(type);
      if (!extension) throw new Error(`approved image has unsupported content type ${type || '(missing)'}`);
      const declaredLength = Number(imageResponse.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
        throw new Error('approved image is larger than 5 MB');
      }
      const imageBytes = await imageResponse.arrayBuffer();
      if (imageBytes.byteLength < 1 || imageBytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(imageBytes.byteLength < 1 ? 'approved image is empty' : 'approved image is larger than 5 MB');
      }
      const form = new FormData();
      form.append('image', new Blob([imageBytes], { type }), `free-pick.${extension}`);
      Object.entries({ date: phoenixOperatingDate(), caption, ...details }).forEach(([key, value]) => form.append(key, String(value || '')));
      response = await auditedFetch(`${config.url}/api/free-pick/publish`, { method: 'POST', headers: { authorization: `Bearer ${config.secret}` }, body: form }, {
        service: 'cloudflare-worker',
        endpointClass: '/api/free-pick/publish',
        callerComponent: 'bot/lib/free-pick-site',
        triggerType: 'approved_pick_sync',
        workflowId: packet.pick_id,
        pickId: packet.pick_id
      }, fetchImpl);
    } catch (error) {
      console.error('Approved free-pick image could not be copied to the website; falling back to text.', error);
    }
  }

  if (!response) {
    response = await auditedFetch(`${config.url}/api/free-pick/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ date: phoenixOperatingDate(), caption, details }),
    }, {
      service: 'cloudflare-worker',
      endpointClass: '/api/free-pick/publish',
      callerComponent: 'bot/lib/free-pick-site',
      triggerType: 'approved_pick_sync',
      workflowId: packet.pick_id,
      pickId: packet.pick_id
    }, fetchImpl);
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 201 || response.status === 202 || response.status === 409) {
    return {
      status: response.status === 409 ? 'already_published' : 'published',
      image: Boolean(payload.imageUrl),
      // Image-backed publication is intentionally a combined site + X
      // operation in the Publisher Worker. Surface that fact so the Discord
      // approval handler does not enqueue a second, text-only X post.
      xPosted: payload.xPosted === true,
      xNeedsAttention: Boolean(payload.imageUrl) && payload.xPosted !== true
    };
  }
  throw new Error(`Free-pick website publish failed (${response.status}): ${payload.error || 'Unknown error'}`);
}

module.exports = { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, manualFreePickPacket, publishApprovedFreePickToSite, shouldUseStandaloneXSync, siteConfig };
