(() => {
  const preview = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  const publisher = preview ? '/preview-api' : 'https://bettinghub-publisher.kobedirwin.workers.dev/api';
  const nodes = {
    date: document.querySelector('[data-free-pick-date]'), caption: document.querySelector('[data-free-pick-caption]'),
    status: document.querySelector('[data-free-pick-status]'), image: document.querySelector('[data-free-pick-image]'),
    textCard: document.querySelector('[data-free-pick-text-card]'), selection: document.querySelector('[data-free-pick-selection]'),
    line: document.querySelector('[data-free-pick-line]'), event: document.querySelector('[data-free-pick-event]'),
    reason: document.querySelector('[data-free-pick-reason]'), placeholder: document.querySelector('[data-free-pick-placeholder]'),
    form: document.querySelector('[data-free-pick-gate-form]'), vip: document.querySelector('[data-free-pick-vip]'),
    noPickCta: document.querySelector('[data-free-pick-no-pick-cta]'),
  };
  if (!nodes.status || !nodes.form) return;
  const page = document.querySelector('.pick-tile') ? 'home' : 'free-pick';
  const source = new URLSearchParams(location.search).get('utm_source') || 'direct';
  let sessionId;
  try {
    sessionId = sessionStorage.getItem('kbh.free-pick.session') || crypto.randomUUID();
    sessionStorage.setItem('kbh.free-pick.session', sessionId);
  } catch { sessionId = crypto.randomUUID(); }
  const track = (event) => {
    if (preview) return;
    fetch(`${publisher}/free-pick/track`, { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, sessionId, page, source }) }).catch(() => {});
  };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const formatDate = value => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' }).format(new Date(`${value}T12:00:00-07:00`));
  const hidePick = () => {
    if (nodes.image) { nodes.image.hidden = true; nodes.image.removeAttribute('src'); }
    if (nodes.textCard) nodes.textCard.hidden = true;
    if (nodes.placeholder) nodes.placeholder.hidden = false;
  };
  const renderPick = (pick, allowHistorical = false) => {
    hidePick();
    if (nodes.noPickCta) nodes.noPickCta.hidden = true;
    if (!pick?.publishedDate || (!allowHistorical && pick.publishedDate !== today())) return false;
    if (nodes.noPickCta) nodes.noPickCta.hidden = pick.publishedDate === today();
    if (nodes.date) nodes.date.textContent = `${formatDate(pick.publishedDate)} · MST`;
    nodes.status.textContent = pick.publishedDate === today() ? 'LIVE' : `LATEST · ${formatDate(pick.publishedDate)}`;
    if (nodes.caption) nodes.caption.textContent = pick.publishedDate === today() ? 'Today’s approved free pick.' : `No free pick today. Latest posted: ${formatDate(pick.publishedDate)}.`;
    if (pick.imageUrl && nodes.image) {
      nodes.image.src = pick.imageUrl;
      nodes.image.hidden = false;
    } else if (nodes.textCard) {
      const details = pick.details || {};
      nodes.selection.textContent = details.selection || details.pick || 'Approved free play';
      nodes.line.textContent = [details.line, details.odds ? `(${details.odds})` : '', details.units ? `${details.units}u` : ''].filter(Boolean).join(' ');
      nodes.event.textContent = [details.sport, details.event].filter(Boolean).join(' • ');
      nodes.reason.textContent = details.reason || 'Published from the approved Discord pick.';
      nodes.textCard.hidden = false;
    }
    if (nodes.placeholder) nodes.placeholder.hidden = true;
    return true;
  };
  const showNoPick = () => {
    hidePick();
    nodes.status.textContent = 'NO PICK TODAY';
    const submitText = nodes.form.querySelector('[data-free-pick-submit-text]');
    if (submitText) submitText.textContent = 'Get future free picks';
    if (nodes.caption) nodes.caption.textContent = 'You can still join the email list for future picks.';
    if (nodes.placeholder) nodes.placeholder.textContent = 'Check back for the next free pick.';
    if (nodes.noPickCta) nodes.noPickCta.hidden = false;
  };
  const showVip = (revealedPick) => {
    if (!nodes.vip) return;
    nodes.vip.hidden = false;
    const headline = nodes.vip.querySelector('[data-free-pick-vip-headline]');
    if (headline && !revealedPick) headline.textContent = 'No free pick today. VIP members get Kobe-reviewed picks, writeups, Discord, and arb alerts.';
    const clock = nodes.vip.querySelector('[data-free-pick-countdown]');
    const offer = nodes.vip.querySelector('p');
    const deadline = Date.parse('2026-10-23T00:00:00-07:00');
    const update = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      if (!remaining) { offer.textContent = 'See current membership options and renewal terms.'; return false; }
      if (clock) clock.textContent = `Offer ends in ${Math.floor(remaining / 86400)}d ${String(Math.floor(remaining % 86400 / 3600)).padStart(2, '0')}h ${String(Math.floor(remaining % 3600 / 60)).padStart(2, '0')}m ${String(remaining % 60).padStart(2, '0')}s.`;
      return true;
    };
    if (update()) {
      const timer = setInterval(() => { if (!update()) clearInterval(timer); }, 1000);
    }
  };
  nodes.vip?.querySelector('[data-free-pick-vip-link]')?.addEventListener('click', () => track('cta_click'));
  nodes.noPickCta?.querySelector('a')?.addEventListener('click', () => track('cta_click'));
  async function loadLegacy() {
    try {
      const response = await fetch(`${publisher}/free-pick/current`, { cache: 'no-store' });
      if (response.status === 404) { showNoPick(); return; }
      if (!response.ok) throw new Error(`Free pick request failed: ${response.status}`);
      const pick = await response.json();
      if (!renderPick(pick, true)) showNoPick();
    } catch (error) {
      nodes.status.textContent = 'UPDATING';
      if (nodes.caption) nodes.caption.textContent = 'The free-pick service is temporarily updating. Please check back shortly.';
      console.warn('Unable to load the free pick.', error);
    }
  }
  async function initialize() {
    try {
      const response = await fetch(`${publisher}/free-pick/gate`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Gate status unavailable');
      const gate = await response.json();
      if (!gate.enabled) { await loadLegacy(); return; }
      document.querySelector('[data-free-pick-legacy-cta]')?.setAttribute('hidden', '');
      document.querySelector('[data-free-pick-legacy-signup]')?.setAttribute('hidden', '');
      hidePick();
      nodes.form.hidden = false;
      nodes.status.textContent = gate.hasPick ? 'EMAIL UNLOCK' : 'NO PICK TODAY';
      const submitText = nodes.form.querySelector('[data-free-pick-submit-text]');
      if (submitText) submitText.textContent = gate.hasPick ? 'Unlock today’s pick' : 'Get future free picks';
      if (nodes.date) nodes.date.textContent = 'Today · MST';
      if (nodes.caption) nodes.caption.textContent = gate.hasPick ? 'Enter your email to unlock today’s pick immediately.' : 'You can still join the email list for future picks.';
      if (nodes.placeholder) nodes.placeholder.textContent = gate.hasPick ? 'Enter your email to unlock today’s pick.' : 'Check back for the next free pick.';
      if (nodes.noPickCta) nodes.noPickCta.hidden = Boolean(gate.hasPick);
      let viewed = false;
      const observer = new IntersectionObserver(entries => {
        if (!viewed && entries.some(entry => entry.isIntersecting)) { viewed = true; track('form_view'); observer.disconnect(); }
      });
      observer.observe(nodes.form);
    } catch (error) {
      nodes.status.textContent = 'UPDATING';
      if (nodes.caption) nodes.caption.textContent = 'The free-pick form is temporarily unavailable. Please try again shortly.';
      console.warn('Unable to check the free-pick gate.', error);
    }
  }
  nodes.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!nodes.form.reportValidity()) return;
    const fields = new FormData(nodes.form);
    const button = nodes.form.querySelector('button[type="submit"]');
    const status = nodes.form.querySelector('[data-free-pick-form-status]');
    button.disabled = true;
    status.textContent = 'Unlocking…';
    try {
      const response = await fetch(`${publisher}/free-pick/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fields.get('email'), firstName: fields.get('firstName'),
          legalAge: fields.get('legalAge') === 'on', consent: fields.get('consent') === 'on',
          website: fields.get('website'), source }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Please try again.');
      track('submit_success');
      nodes.form.hidden = true;
      const revealedPick = Boolean(result.hasPick && renderPick(result.pick));
      if (revealedPick) track('pick_revealed');
      else showNoPick();
      showVip(revealedPick);
      if (nodes.caption) nodes.caption.textContent = revealedPick ? 'Unlocked. Check your email for a copy.' : 'You’re on the list. There is no free pick today.';
    } catch (error) {
      status.textContent = error.message || 'We couldn’t unlock the pick. Please try again.';
    } finally { button.disabled = false; }
  });
  initialize();
})();
