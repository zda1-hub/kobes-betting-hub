(() => {
  const workerOrigin = window.__KBH_MEMBERSHIP_CONFIG__?.workerOrigin || 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';
  const uuid = /^[0-9a-f-]{36}$/i;
  const allowedSources = new Set(['discord', 'x', 'instagram', 'google', 'email', 'referral', 'affiliate', 'direct', 'other']);
  const clean = (value, limit = 160) => String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, limit);
  const normalizeSource = (value) => {
    const raw = clean(value).toLowerCase();
    if (!raw) return '';
    if (allowedSources.has(raw)) return raw;
    if (/discord/.test(raw)) return 'discord';
    if (/^(x|twitter)$/.test(raw) || /(^|\.)x\.com$|twitter\.com|t\.co/.test(raw)) return 'x';
    if (/instagram|(^|\.)ig\.me$/.test(raw)) return 'instagram';
    if (/google/.test(raw)) return 'google';
    if (/mail|newsletter/.test(raw)) return 'email';
    if (/referr/.test(raw)) return 'referral';
    if (/affiliate|creator|partner/.test(raw)) return 'affiliate';
    return 'other';
  };
  const query = new URLSearchParams(location.search);
  const referralIdentifier = clean(query.get('ref') || query.get('referral') || '', 64).toUpperCase();
  const rawReferrer = clean(document.referrer, 500);
  const referrerHost = (() => { try { return rawReferrer ? new URL(rawReferrer).hostname.toLowerCase() : ''; } catch { return ''; } })();
  const siteHost = location.hostname.toLowerCase();
  const isInternalReferrer = referrerHost === siteHost || referrerHost.endsWith(`.${siteHost}`)
    || referrerHost === 'kobesbettinghub.com' || referrerHost.endsWith('.kobesbettinghub.com')
    || referrerHost.endsWith('.kobedirwin.workers.dev') || referrerHost === 'checkout.stripe.com';
  const taggedSource = normalizeSource(query.get('utm_source'));
  const referrerSource = isInternalReferrer ? '' : normalizeSource(referrerHost);
  const incomingSource = referralIdentifier ? 'referral' : taggedSource || referrerSource;
  const inferredMedium = !incomingSource ? '' : ['x', 'instagram'].includes(incomingSource) ? 'organic_social' : incomingSource === 'discord' ? 'community' : incomingSource;
  let sessionId;
  try {
    sessionId = localStorage.getItem('kbh.analytics.session');
    if (!uuid.test(sessionId || '')) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('kbh.analytics.session', sessionId);
    }
  } catch { sessionId = crypto.randomUUID(); }
  const stored = (() => { try { return JSON.parse(localStorage.getItem('kbh.analytics.attribution') || '{}'); } catch { return {}; } })();
  const firstSource = normalizeSource(stored.first_source) || incomingSource || 'direct';
  const current = {
    first_source: firstSource,
    first_medium: clean(stored.first_medium || (firstSource === incomingSource ? query.get('utm_medium') || inferredMedium : '')),
    first_campaign: clean(stored.first_campaign || (firstSource === incomingSource ? query.get('utm_campaign') : '')),
    first_content: clean(stored.first_content || (firstSource === incomingSource ? query.get('utm_content') : '')),
    last_source: incomingSource || normalizeSource(stored.last_source) || firstSource,
    last_medium: clean(incomingSource ? query.get('utm_medium') || inferredMedium : stored.last_medium || stored.utm_medium),
    last_campaign: clean(incomingSource ? query.get('utm_campaign') : stored.last_campaign || stored.utm_campaign),
    last_content: clean(incomingSource ? query.get('utm_content') : stored.last_content || stored.utm_content),
    utm_source: taggedSource,
    utm_medium: clean(query.get('utm_medium')),
    utm_campaign: clean(query.get('utm_campaign')),
    utm_content: clean(query.get('utm_content')),
    referral_identifier: referralIdentifier || clean(stored.referral_identifier, 64),
    document_referrer: rawReferrer || clean(stored.document_referrer, 500),
    referrer_host: (!isInternalReferrer && referrerHost) || clean(stored.referrer_host),
    landing_path: clean(stored.landing_path || `${location.pathname}${location.search}`, 300),
  };
  try { localStorage.setItem('kbh.analytics.attribution', JSON.stringify(current)); } catch { /* storage is optional */ }
  window.KBHAnalytics = Object.freeze({ sessionId, attribution: current });
  const eventName = /\/(?:join|join\.html|membership|membership\.html)$/.test(location.pathname) ? 'join_page_view' : 'page_view';
  const bucket = Math.floor(Date.now() / 1800000);
  fetch(`${workerOrigin}/analytics/event`, {
    method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: eventName, session_id: sessionId, path: location.pathname, attribution: current, dedupe_key: `${eventName}:${sessionId}:${location.pathname}:${bucket}` }),
  }).catch(() => {});
})();
