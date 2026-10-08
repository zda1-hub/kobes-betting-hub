(() => {
  const key = 'kbh.tracking.consent.v1';
  let state;
  try { state = localStorage.getItem(key); } catch { state = null; }
  if (!['accepted', 'declined'].includes(state)) state = null;
  const allowed = () => state === 'accepted';
  const update = value => {
    state = value;
    try {
      localStorage.setItem(key, value);
      if (value === 'declined') for (const name of ['kbh.analytics.session', 'kbh.analytics.last_seen', 'kbh.analytics.attribution', 'kbh.analytics.first_touch']) localStorage.removeItem(name);
    } catch { /* This tab still honors the choice. */ }
    document.querySelector('[data-tracking-choice]')?.remove();
    window.dispatchEvent(new CustomEvent('kbh:consent-change', { detail: { allowed: allowed() } }));
  };
  window.KBHConsent = Object.freeze({ allowed, update, status: () => state });
  document.addEventListener('click', event => { const choice = event.target.closest?.('[data-consent-update]')?.dataset.consentUpdate; if (choice === 'accepted' || choice === 'declined') update(choice); });
  if (state || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname) || location.protocol === 'file:' || /^\/welcome(?:\.|\/|$)/.test(location.pathname)) return;
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-tracking-choice]')) return;
    const box = document.createElement('aside');
    box.dataset.trackingChoice = '';
    box.setAttribute('aria-label', 'Optional website tracking');
    box.innerHTML = '<p>Allow site analytics and advertising measurement? This helps us see which pages and campaigns lead to memberships. <a href="/privacy">Privacy</a></p><div><button type="button" data-choice="declined">Only necessary</button><button type="button" data-choice="accepted">Allow tracking</button></div>';
    Object.assign(box.style, { position: 'fixed', bottom: '16px', left: '16px', right: '16px', maxWidth: '480px', margin: 'auto', padding: '16px', borderRadius: '18px', background: '#111', color: '#fff', boxShadow: '0 8px 30px #0006', zIndex: '9999', fontFamily: 'Manrope, sans-serif', fontSize: '14px' });
    const row = box.querySelector('div'); Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
    for (const button of box.querySelectorAll('button')) Object.assign(button.style, { border: '0', borderRadius: '100px', padding: '10px 14px', cursor: 'pointer', font: 'inherit', background: button.dataset.choice === 'accepted' ? '#ff8200' : '#eee', color: '#111' });
    box.addEventListener('click', event => { const choice = event.target.closest('button[data-choice]')?.dataset.choice; if (choice) update(choice); });
    document.body.append(box);
  });
})();
