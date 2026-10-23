(() => {
  const pixelId = 'rht3t';
  const events = Object.freeze({ checkout: 'tw-rht3t-rhuz7', trial: 'tw-rht3t-rhuz5', purchase: 'tw-rht3t-rhuz6' });
  const allowedHosts = new Set(['kobesbettinghub.com', 'www.kobesbettinghub.com', 'kobes-betting-hub.kobedirwin.workers.dev']);
  const privateKeys = ['state', 'session_id', 'code', 'token', 'auth'];
  const offers = new Set(['starter', 'trial_2_day', 'referral_trial', 'first_month_back', 'monthly', 'six_month', 'annual']);
  const sent = new Set();
  let initialized = false;

  function initialize() {
    if (initialized || !window.KBHConsent?.allowed() || !allowedHosts.has(location.hostname)
        || window.__KBH_MEMBERSHIP_CONFIG__?.environment === 'staging'
        || privateKeys.some(key => new URLSearchParams(location.search).has(key))) return;
    initialized = true;
    const twq = window.twq || function (...args) { twq.queue.push(args); };
    if (!window.twq) {
      twq.version = '1.1'; twq.queue = [];
      window.twq = twq;
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://static.ads-twitter.com/uwt.js';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode.insertBefore(script, firstScript);
    }
    twq('config', pixelId);
    window.KBHX = Object.freeze({
      trackCheckout(offer, requestId) {
        if (!window.KBHConsent?.allowed() || !offers.has(offer) || !/^[0-9a-f-]{36}$/i.test(requestId || '')) return false;
        const key = `checkout:${requestId}`;
        if (sent.has(key)) return false;
        twq('event', events.checkout, { conversion_id: key });
        sent.add(key);
        return true;
      },
      trackTrial(receipt) {
        if (!window.KBHConsent?.allowed() || !receipt || !/^trial:[0-9a-f]{64}$/.test(receipt.eventId || '')) return false;
        return sendOnce('trial', receipt.eventId, { conversion_id: receipt.eventId });
      },
      trackPurchase(receipt) {
        if (!window.KBHConsent?.allowed() || !receipt || !/^purchase:[0-9a-f]{64}$/.test(receipt.eventId || '')
            || !Number.isFinite(receipt.value) || receipt.value <= 0 || !/^[A-Z]{3}$/.test(receipt.currency || '')) return false;
        return sendOnce('purchase', receipt.eventId, { conversion_id: receipt.eventId, value: receipt.value, currency: receipt.currency });
      }
    });
    if (window.__KBH_VERIFIED_TRIAL__) window.KBHX.trackTrial(window.__KBH_VERIFIED_TRIAL__);
    if (window.__KBH_VERIFIED_PURCHASE__) window.KBHX.trackPurchase(window.__KBH_VERIFIED_PURCHASE__);
  }

  function sendOnce(kind, eventId, payload) {
    const key = `kbh.x.${eventId}`;
    if (sent.has(key)) return false;
    try { if (window.localStorage.getItem(key)) return false; } catch { /* In-memory dedupe still applies. */ }
    window.twq('event', events[kind], payload);
    sent.add(key);
    try { window.localStorage.setItem(key, 'queued'); } catch { /* Storage is optional. */ }
    return true;
  }

  window.addEventListener('kbh:tracking-url-ready', initialize, { once: true });
  window.addEventListener('kbh:consent-change', event => { if (event.detail.allowed) initialize(); });
  initialize();
})();
