(() => {
  let initialized = false;
  const start = () => {
  if (initialized) return;
  initialized = true;
  if (['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname) || location.protocol === 'file:') return;
  const workerOrigin = window.__KBH_MEMBERSHIP_CONFIG__?.workerOrigin || 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';
  const uuid = /^[0-9a-f-]{36}$/i;
  const allowedSources = new Set(['discord', 'x', 'kobe_x', 'instagram', 'tiktok', 'youtube', 'facebook', 'google', 'email', 'referral', 'affiliate', 'direct', 'other']);
  const clean = (value, limit = 160) => String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, limit);
  const normalizeSource = (value) => {
    const raw = clean(value).toLowerCase();
    if (!raw) return '';
    if (allowedSources.has(raw)) return raw;
    if (/discord/.test(raw)) return 'discord';
    if (/^(x|twitter)$/.test(raw) || /(^|\.)x\.com$|twitter\.com|t\.co/.test(raw)) return 'x';
    if (raw === 'ig' || /instagram|(^|\.)ig\.me$/.test(raw)) return 'instagram';
    if (raw === 'tt' || /tiktok|(^|\.)vm\.tiktok\.com$/.test(raw)) return 'tiktok';
    if (raw === 'yt' || /youtube|youtu\.be/.test(raw)) return 'youtube';
    if (raw === 'fb' || /facebook|fb\.com|fb\.me/.test(raw)) return 'facebook';
    if (/google/.test(raw)) return 'google';
    if (/mail|newsletter/.test(raw)) return 'email';
    if (/referr/.test(raw)) return 'referral';
    if (/affiliate|creator|partner/.test(raw)) return 'affiliate';
    return 'other';
  };
  const query = new URLSearchParams(location.search);
  const referralIdentifier = clean(query.get('ref') || query.get('referral') || '', 64).toUpperCase();
  const rawReferrer = (() => { try { return `${new URL(document.referrer).origin}/`; } catch { return ''; } })();
  const referrerHost = (() => { try { return rawReferrer ? new URL(rawReferrer).hostname.toLowerCase() : ''; } catch { return ''; } })();
  const siteHost = location.hostname.toLowerCase();
  const isInternalReferrer = referrerHost === siteHost || referrerHost.endsWith(`.${siteHost}`)
    || referrerHost === 'kobesbettinghub.com' || referrerHost.endsWith('.kobesbettinghub.com')
    || referrerHost.endsWith('.kobedirwin.workers.dev') || referrerHost === 'checkout.stripe.com';
  const taggedSource = normalizeSource(query.get('utm_source'));
  const referrerSource = isInternalReferrer ? '' : normalizeSource(referrerHost);
  const incomingSource = referralIdentifier ? 'referral' : taggedSource || referrerSource;
  const inferredMedium = !incomingSource ? '' : ['x', 'kobe_x', 'instagram', 'tiktok', 'youtube', 'facebook'].includes(incomingSource) ? 'organic_social' : incomingSource === 'discord' ? 'community' : incomingSource;
  let sessionId;
  let newSession = false;
  try {
    sessionId = localStorage.getItem('kbh.analytics.session');
    const lastSeen = Number(localStorage.getItem('kbh.analytics.last_seen'));
    if (!uuid.test(sessionId || '') || !lastSeen || Date.now() - lastSeen > 1800000 || lastSeen > Date.now()) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('kbh.analytics.session', sessionId);
      newSession = true;
    }
    localStorage.setItem('kbh.analytics.last_seen', String(Date.now()));
  } catch { sessionId = crypto.randomUUID(); newSession = true; }
  const stored = (() => {
    try {
      const latest = newSession ? {} : JSON.parse(localStorage.getItem('kbh.analytics.attribution') || '{}');
      const original = JSON.parse(localStorage.getItem('kbh.analytics.first_touch') || '{}');
      return { ...latest, ...original };
    } catch { return {}; }
  })();
  const firstSource = normalizeSource(stored.first_source) || incomingSource || 'direct';
  const current = {
    first_source: firstSource,
    first_medium: clean(stored.first_medium || (firstSource === incomingSource ? query.get('utm_medium') || inferredMedium : '')),
    first_campaign: clean(stored.first_campaign || (firstSource === incomingSource ? query.get('utm_campaign') : '')),
    first_content: clean(stored.first_content || (firstSource === incomingSource ? query.get('utm_content') : '')),
    first_term: clean(stored.first_term || (firstSource === incomingSource ? query.get('utm_term') : '')),
    last_source: incomingSource || normalizeSource(stored.last_source) || firstSource,
    last_medium: clean(incomingSource ? query.get('utm_medium') || inferredMedium : stored.last_medium || stored.utm_medium),
    last_campaign: clean(incomingSource ? query.get('utm_campaign') : stored.last_campaign || stored.utm_campaign),
    last_content: clean(incomingSource ? query.get('utm_content') : stored.last_content || stored.utm_content),
    last_term: clean(incomingSource ? query.get('utm_term') : stored.last_term || stored.utm_term),
    utm_source: clean(query.get('utm_source') || stored.utm_source),
    utm_medium: clean(query.get('utm_medium') || stored.utm_medium),
    utm_campaign: clean(query.get('utm_campaign') || stored.utm_campaign),
    utm_content: clean(query.get('utm_content') || stored.utm_content),
    utm_term: clean(query.get('utm_term') || stored.utm_term),
    gclid: clean(query.get('gclid') || stored.gclid, 160),
    fbclid: clean(query.get('fbclid') || stored.fbclid, 160),
    msclkid: clean(query.get('msclkid') || stored.msclkid, 160),
    referral_identifier: referralIdentifier || clean(stored.referral_identifier, 64),
    document_referrer: rawReferrer || clean(stored.document_referrer, 500),
    referrer_host: (!isInternalReferrer && referrerHost) || clean(stored.referrer_host),
    landing_path: clean(stored.landing_path || location.pathname, 300),
  };
  try {
    localStorage.setItem('kbh.analytics.attribution', JSON.stringify(current));
    if (!localStorage.getItem('kbh.analytics.first_touch')) localStorage.setItem('kbh.analytics.first_touch', JSON.stringify({
      first_source: current.first_source, first_medium: current.first_medium, first_campaign: current.first_campaign,
      first_content: current.first_content, first_term: current.first_term, landing_path: current.landing_path,
    }));
  } catch { /* storage is optional */ }
  const pagePath = location.pathname === '/join.html' ? '/join' : location.pathname;
  let pageViewReady = Promise.resolve();
  const sendInteraction = (eventName, targetId, placement = 'unknown', destination = null, ctaText = '') => {
    if (!window.KBHConsent?.allowed()) return false;
    if (!/^[a-z][a-z0-9_]{2,79}$/.test(targetId || '')) return false;
    const safeDestination = destination && /^\/[a-z0-9/.-]{0,119}$/.test(destination) ? destination : null;
    pageViewReady.then(() => fetch(`${workerOrigin}/analytics/interaction`, {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, interaction_id: crypto.randomUUID(), event_name: eventName,
        target_id: targetId, location: placement, path: pagePath, destination: safeDestination,
        cta_text: eventName === 'cta_click' ? ctaText.replace(/\s+/g, ' ').trim().slice(0, 100) : '' }),
    })).catch(() => {});
    try { window.KBHGoogle?.track(eventName, { cta_id: targetId, cta_location: placement, page_path: pagePath, ...(safeDestination ? { destination: safeDestination } : {}) }); } catch { /* Measurement never blocks the site. */ }
    return true;
  };
  window.KBHAnalytics = Object.freeze({ sessionId, attribution: current, track: sendInteraction });
  if (/^\/(?:admin|admin-analytics|member|partner|creator|welcome)(?:\/|\.|$)/.test(location.pathname)) return;
  const eventName = /\/(?:join|join\.html|membership|membership\.html)$/.test(location.pathname) ? 'join_page_view' : 'page_view';
  const bucket = Math.floor(Date.now() / 1800000);
  pageViewReady = fetch(`${workerOrigin}/analytics/event`, {
    method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: eventName, session_id: sessionId, path: location.pathname, attribution: current, dedupe_key: `${eventName}:${sessionId}:${location.pathname}:${bucket}` }),
  }).catch(() => {});
  if (typeof document.querySelectorAll !== 'function') return;

  const pageKey = pagePath === '/' || pagePath === '/index.html' ? 'home' : pagePath.replace(/^\//, '').replace(/\.html$/, '').replace(/[^a-z0-9]/g, '_');
  const trackedLinks = {
    '.header-join': ['header_join', 'header'],
    '.membership-tile': ['membership_tile', 'home_grid'],
    '.arbitrage-banner': ['arbitrage_explainer', 'home_banner'],
    '[data-free-pick-no-pick-cta] a': ['no_pick_join', 'free_pick'],
    '[data-free-pick-vip-link]': ['free_pick_vip_join', 'free_pick'],
    '[data-free-pick-legacy-cta]': ['free_pick_open', 'free_pick'],
    '.membership-share .button': ['referral_program', 'join_body'],
    '.membership-manage .button': ['manage_membership', 'join_body'],
  };
  for (const [selector, [id, placement]] of Object.entries(trackedLinks)) {
    document.querySelectorAll(selector).forEach(element => {
      if (!element.dataset.analyticsId) element.dataset.analyticsId = `${pageKey}_${id}`;
      if (!element.dataset.analyticsLocation) element.dataset.analyticsLocation = placement;
    });
  }
  document.querySelectorAll('.site-menu a, .footer-nav a, .social-icon, a[href^="mailto:"], a[href^="tel:"]').forEach(element => {
    if (element.dataset.analyticsId) return;
    const placement = element.closest('.site-menu') ? 'navigation' : element.closest('footer') ? 'footer' : element.closest('.header-social') ? 'header' : 'body';
    let action = '';
    try {
      const url = new URL(element.href);
      action = url.protocol === 'mailto:' ? 'email_contact' : url.protocol === 'tel:' ? 'phone_contact'
        : url.origin === location.origin ? url.pathname.replace(/\/(?:index)?(?:\.html)?$/, '/home').replace(/[^a-z0-9]/gi, '_')
        : url.hostname.replace(/[^a-z0-9]/gi, '_');
    } catch { return; }
    element.dataset.analyticsId = `${pageKey}_${placement}_${action}`.toLowerCase().replace(/_+/g, '_').slice(0, 80);
    element.dataset.analyticsLocation = placement;
  });
  document.querySelectorAll('[data-checkout]').forEach(button => {
    button.dataset.analyticsId = `join_plan_${button.dataset.checkout}${button.hasAttribute('data-referral-button') ? '_referral' : ''}`;
    button.dataset.analyticsLocation = 'pricing';
  });
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-analytics-id]');
    if (!target || target.closest('[hidden]')) return;
    const href = target.getAttribute('href');
    let destination = null;
    try { if (href) { const url = new URL(href, location.href); destination = url.origin === location.origin ? url.pathname : null; } } catch { /* invalid links are not tracked */ }
    const label = target.getAttribute('aria-label') || target.textContent || '';
    sendInteraction('cta_click', target.dataset.analyticsId, target.dataset.analyticsLocation || 'unknown', destination, label);
  }, { passive: true, capture: true });

  const formDefinitions = [
    ['[data-free-pick-gate-form]', `${pageKey}_free_pick_gate`, 'free_pick'],
    ['[data-email-signup]', `${pageKey}_email_signup`, 'home_grid'],
  ];
  for (const [selector, formId, placement] of formDefinitions) {
    const form = document.querySelector(selector);
    if (!form) continue;
    let started = false; let viewed = false;
    const view = () => { if (!viewed && !form.hidden) { viewed = true; sendInteraction('form_view', formId, placement); } };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => { if (entries.some(item => item.isIntersecting)) { view(); observer.disconnect(); } });
      observer.observe(form);
    } else view();
    form.addEventListener('focusin', () => { if (!started) { started = true; sendInteraction('form_start', formId, placement); } }, { once: true });
    form.addEventListener('submit', () => sendInteraction('form_submit_attempt', formId, placement));
    form.addEventListener('invalid', () => {
      sendInteraction('form_submit_attempt', formId, placement);
      sendInteraction('form_validation_error', formId, placement);
    }, { capture: true, once: true });
  }
  if ('IntersectionObserver' in window) {
    const sections = {
      '.membership-tile': 'membership_offer', '.pick-tile': 'free_pick', '.landing-record': 'tracked_record',
      '.membership-confirmation': 'membership_connection', '.first-month.offer-choice': 'first_month_plan',
      '.seven-days.offer-choice': 'starter_plan', '.six-months.offer-choice': 'six_month_plan', '.one-year.offer-choice': 'annual_plan',
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target.closest('[hidden]')) continue;
        sendInteraction('section_view', `${pageKey}_${entry.target.dataset.analyticsSection}`, 'body');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.5 });
    for (const [selector, id] of Object.entries(sections)) document.querySelectorAll(selector).forEach(section => {
      section.dataset.analyticsSection = id; observer.observe(section);
    });
  }
  const reached = new Set();
  addEventListener('scroll', () => {
    const total = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    const depth = Math.round(scrollY / total * 100);
    for (const step of [25, 50, 75]) if (depth >= step && !reached.has(step)) {
      reached.add(step); sendInteraction('scroll_depth', `${pageKey}_scroll_${step}`, 'body');
    }
  }, { passive: true });

  // One bounded, anonymous engagement sample per page load. Never collect text,
  // form values, element identifiers, or clicks inside private inputs.
  if (/^\/(?:admin|admin-analytics|member|partner|creator|welcome)(?:\/|\.|$)/.test(location.pathname)) return;
  const pageId = crypto.randomUUID();
  const path = location.pathname === '/join.html' ? '/join' : location.pathname;
  const cells = new Map();
  let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  let foregroundMs = 0;
  let maxScroll = 0;
  let clicks = 0;
  let lastReport = 0;
  const measure = () => {
    const height = Math.max(document.documentElement.scrollHeight - innerHeight, 0);
    maxScroll = Math.max(maxScroll, height ? Math.round(scrollY / height * 100) : 100);
  };
  const elapsed = () => foregroundMs + (visibleSince === null ? 0 : Math.max(0, performance.now() - visibleSince));
  const report = (force = false) => {
    if (!window.KBHConsent?.allowed()) return;
    if (!force && performance.now() - lastReport < 14000) return;
    lastReport = performance.now();
    measure();
    const payload = JSON.stringify({
      session_id: sessionId, page_id: pageId, path,
      foreground_seconds: Math.min(1800, Math.round(elapsed() / 1000)),
      max_scroll_pct: Math.min(100, maxScroll), click_count: clicks,
      click_cells: [...cells].map(([cell, count]) => ({ cell, count })),
    });
    fetch(`${workerOrigin}/analytics/engagement`, {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: payload,
    }).catch(() => {});
  };
  addEventListener('scroll', measure, { passive: true });
  document.addEventListener('click', event => {
    if (event.target.closest?.('input,textarea,select,[contenteditable],form')) return;
    if (clicks >= 20) return;
    if (path === '/join') {
      const width = Math.max(innerWidth, 1);
      const height = Math.max(document.documentElement.scrollHeight, 1);
      const x = Math.min(11, Math.max(0, Math.floor(event.clientX / width * 12)));
      const y = Math.min(11, Math.max(0, Math.floor((event.clientY + scrollY) / height * 12)));
      const cell = y * 12 + x;
      cells.set(cell, Math.min(20, (cells.get(cell) || 0) + 1));
    }
    clicks += 1;
    report();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && visibleSince !== null) {
      foregroundMs += performance.now() - visibleSince;
      visibleSince = null;
      report(true);
    } else if (document.visibilityState === 'visible' && visibleSince === null) {
      visibleSince = performance.now();
    }
  });
  addEventListener('pagehide', () => report(true));
  setInterval(() => { if (document.visibilityState === 'visible') report(); }, 15000);
  };
  if (window.KBHConsent?.allowed()) start();
  else window.addEventListener('kbh:consent-change', event => { if (event.detail.allowed) start(); });
})();
