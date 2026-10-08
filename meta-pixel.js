(() => {
  let initialized = false;
  const initialize = () => {
  if (initialized || !window.KBHConsent?.allowed()) return;
  // Preview and staging must never contribute to the production ad dataset.
  if (!['kobesbettinghub.com', 'www.kobesbettinghub.com', 'kobes-betting-hub.kobedirwin.workers.dev'].includes(location.hostname)
      || window.__KBH_MEMBERSHIP_CONFIG__?.environment === 'staging') return;
  // Never load the advertising SDK while a private activation/OAuth credential is in the URL.
  if (['state', 'session_id', 'code', 'token', 'auth'].some(key => new URLSearchParams(location.search).has(key))) return;
  initialized = true;
  const pixelId = '4640857832799621';
  let fbq = window.fbq;
  if (!fbq) {
    fbq = function (...args) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    };
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    const script = document.createElement('script'); script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(script, firstScript);
    fbq('set', 'autoConfig', false, pixelId);
    fbq('init', pixelId); fbq('track', 'PageView');
  }
  const sent = new Set();
  const offers = new Set(['starter', 'trial_2_day', 'referral_trial', 'first_month_back', 'six_month', 'annual']);
  window.KBHMeta = Object.freeze({
    trackLead(formId) {
      if (!window.KBHConsent?.allowed() || !/^[a-z][a-z0-9_]{2,79}$/.test(formId || '')) return false;
      const key = `lead:${formId}`;
      if (sent.has(key)) return false;
      fbq('track', 'Lead', { content_category: 'Free-pick email signup' }, { eventID: `${key}:${crypto.randomUUID()}` });
      sent.add(key); return true;
    },
    trackCheckout(offer, requestId) {
      if (!window.KBHConsent?.allowed()) return false;
      if (!offers.has(offer) || !/^[0-9a-f-]{36}$/i.test(requestId || '')) return false;
      const id = `checkout:${requestId}`;
      if (sent.has(id)) return false;
      fbq('track', 'InitiateCheckout', { content_name: `Kobe's Betting Hub ${offer}`, content_category: 'VIP membership', currency: 'USD' }, { eventID: id });
      sent.add(id); return true;
    },
    trackPurchase(receipt) {
      if (!window.KBHConsent?.allowed()) return false;
      if (!receipt || !/^purchase:[0-9a-f]{64}$/.test(receipt.eventId || '')
          || !Number.isFinite(receipt.value) || receipt.value <= 0
          || !/^[A-Z]{3}$/.test(receipt.currency || '')) return false;
      const key = `kbh.meta.${receipt.eventId}`;
      if (sent.has(key)) return false;
      try { if (window.localStorage.getItem(key)) return false; } catch { /* In-memory dedupe remains available. */ }
      fbq('track', 'Purchase', { value: receipt.value, currency: receipt.currency, content_category: 'VIP membership' }, { eventID: receipt.eventId });
      sent.add(key);
      try { window.localStorage.setItem(key, 'queued'); } catch { /* Storage is optional; Meta also receives a stable event ID. */ }
      return true;
    }
  });
  if (window.__KBH_VERIFIED_PURCHASE__) window.KBHMeta.trackPurchase(window.__KBH_VERIFIED_PURCHASE__);
  };
  window.addEventListener('kbh:tracking-url-ready', initialize, { once: true });
  window.addEventListener('kbh:consent-change', event => { if (event.detail.allowed) initialize(); });
  initialize();
})();
