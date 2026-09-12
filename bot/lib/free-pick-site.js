const DEFAULT_PUBLISHER_URL = 'https://bettinghub-publisher.kobesbettinghub-publisher.workers.dev';
const { publicPickTerms, sourceEvidence } = require('./source-review');

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
      const imageResponse = await fetchImpl(imageUrl);
      if (imageResponse.ok) {
        const type = imageResponse.headers.get('content-type') || 'image/png';
        const form = new FormData();
        form.append('image', new Blob([await imageResponse.arrayBuffer()], { type }), 'free-pick.png');
        Object.entries({ date: phoenixOperatingDate(), caption, ...details }).forEach(([key, value]) => form.append(key, String(value || '')));
        response = await fetchImpl(`${config.url}/api/free-pick/publish`, { method: 'POST', headers: { authorization: `Bearer ${config.secret}` }, body: form });
      }
    } catch (error) {
      console.error('Approved free-pick image could not be copied to the website; falling back to text.', error);
    }
  }

  if (!response) {
    response = await fetchImpl(`${config.url}/api/free-pick/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ date: phoenixOperatingDate(), caption, details }),
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 201 || response.status === 202 || response.status === 409) {
    return { status: response.status === 409 ? 'already_published' : 'published', image: Boolean(payload.imageUrl) };
  }
  throw new Error(`Free-pick website publish failed (${response.status}): ${payload.error || 'Unknown error'}`);
}

module.exports = { publishApprovedFreePickToSite, siteConfig };
