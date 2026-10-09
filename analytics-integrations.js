(() => {
  const config = window.__KBH_TRACKING_CONFIG__ || {};
  const valid = (value, expression) => typeof value === 'string' && expression.test(value);
  const gtm = valid(config.gtm, /^GTM-[A-Z0-9]+$/) ? config.gtm : '';
  const ga4 = valid(config.ga4, /^G-[A-Z0-9]+$/) ? config.ga4 : '';
  const ads = valid(config.googleAds, /^AW-[0-9]+$/) ? config.googleAds : '';
  const leadLabel = valid(config.leadLabel, /^[A-Za-z0-9_-]+$/) ? config.leadLabel : '';
  const purchaseLabel = valid(config.purchaseLabel, /^[A-Za-z0-9_-]+$/) ? config.purchaseLabel : '';
  let started = false;
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args) => window.dataLayer.push(args);
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  const start = () => {
    if (started || !window.KBHConsent?.allowed() || (!gtm && !ga4 && !ads)) return;
    started = true;
    gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: ads ? 'granted' : 'denied', ad_user_data: ads ? 'granted' : 'denied', ad_personalization: ads ? 'granted' : 'denied' });
    if (gtm) window.dataLayer.push({ event: 'gtm.js', 'gtm.start': Date.now() });
    const script = document.createElement('script'); script.async = true;
    script.src = gtm ? `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}` : `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4 || ads)}`;
    document.head.append(script);
    if (!gtm) {
      gtag('js', new Date());
      if (ga4) gtag('config', ga4);
      if (ads) gtag('config', ads);
    }
  };
  window.KBHGoogle = Object.freeze({
    track(name, parameters = {}) {
      if (!window.KBHConsent?.allowed()) return;
      start(); if (!started) return;
      const safe = Object.fromEntries(Object.entries(parameters).filter(([key, value]) => /^[a-z_]{2,40}$/.test(key) && (typeof value === 'number' || typeof value === 'string' && value.length <= 120)));
      if (gtm) window.dataLayer.push({ event: name, ...safe });
      else gtag('event', name, safe);
      if (!gtm && ads && name === 'generate_lead' && leadLabel) gtag('event', 'conversion', { send_to: `${ads}/${leadLabel}` });
      if (!gtm && ads && name === 'purchase' && purchaseLabel && Number.isFinite(safe.value)) gtag('event', 'conversion', { send_to: `${ads}/${purchaseLabel}`, value: safe.value, currency: safe.currency || 'USD', transaction_id: safe.transaction_id });
    },
  });
  window.addEventListener('kbh:consent-change', event => {
    if (event.detail.allowed) start();
    else gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  });
  start();
})();
