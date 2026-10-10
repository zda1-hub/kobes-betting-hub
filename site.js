(() => {
  const localPreview = ['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname) || location.protocol === 'file:';
  document.querySelectorAll('[data-year], #year').forEach(node => node.textContent = new Date().getFullYear());
  const tickerToggle = document.querySelector('[data-ticker-toggle]');
  tickerToggle?.addEventListener('click', () => {
    const ticker = tickerToggle.closest('.site-ticker');
    const paused = ticker.toggleAttribute('data-paused');
    tickerToggle.setAttribute('aria-pressed', String(paused));
    tickerToggle.setAttribute('aria-label', paused ? 'Play banner' : 'Pause banner');
    tickerToggle.querySelector('span').textContent = paused ? '▶' : 'Ⅱ';
  });
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const closeMenu = () => { menu?.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); };
  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => { if (!event.target.closest('[data-header]')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.classList.contains('is-open')) { closeMenu(); toggle.focus(); }
  });
  if (localPreview) document.querySelectorAll('[data-preview-plan]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('[data-checkout-message]').textContent = 'This is a local design preview. No checkout opened and no charge was made.';
  }));
  if (localPreview) document.querySelector('[data-email-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    document.querySelector('[data-email-message]').textContent = 'Preview only — your email has not been submitted. The free-pick card above is available to browse.';
  });
  // The first-month promotion ends at midnight MST on October 23.
  // Keep this aligned with the checkout worker before changing the offer date.
  const offerEndsAt = Date.parse('2026-10-23T07:00:00Z');
  const joinUrl = new URL('join.html#offer', document.currentScript?.src || location.href).href;
  const checkoutResult = new URLSearchParams(location.search).has('checkout');
  const firstMonthCard = document.querySelector('.first-month:not(.offer-choice-referral)');
  const primaryMembershipButtons = document.querySelectorAll('[data-primary-membership-checkout], .first-month:not(.offer-choice-referral) [data-checkout="first_month_back"]');
  let banner;
  let modal;
  let timer;
  let prompted = false;
  const remaining = () => Math.max(0, Math.floor((offerEndsAt - Date.now()) / 1000));
  const expireOffer = () => {
    banner?.remove();
    modal?.remove();
    clearInterval(timer);
    if (firstMonthCard) {
      firstMonthCard.querySelector('h2').textContent = 'Monthly Membership';
      firstMonthCard.querySelector('.mock-price').innerHTML = '<span class="offer-attention">$32.99</span><small> today</small>';
      firstMonthCard.querySelector('p:not(.mock-price)').textContent = '$32.99/month until canceled.';
      firstMonthCard.querySelector('.plan-note').textContent = 'Standard monthly rate. No free trial.';
    }
    primaryMembershipButtons.forEach((button) => {
      button.dataset.checkout = 'monthly';
      button.textContent = button.classList.contains('vip-join-button') ? 'Join now · $32.99/month' : 'Join for $32.99';
    });
    const vipTerms = document.querySelector('[data-primary-membership-terms]');
    if (vipTerms) vipTerms.textContent = '$32.99 today, then $32.99/month until canceled. No free trial.';
    document.querySelectorAll('[data-free-pick-vip] p').forEach(copy => {
      copy.textContent = '$32.99/month until canceled. No free trial.';
    });
    const landingOffer = document.querySelector('.membership-tile');
    if (landingOffer) {
      landingOffer.querySelector('strong').textContent = '$32.99 HUB VIP Membership';
      const spans = landingOffer.querySelectorAll('span');
      if (spans[0]) spans[0].textContent = '$32.99/month until canceled';
      if (spans[1]) spans[1].remove();
    }
  };
  if (!checkoutResult && remaining() > 0 && document.querySelector('.site-header')) {
    banner = document.createElement('a');
    banner.className = 'october-offer-banner';
    banner.href = joinUrl;
    banner.setAttribute('aria-label', 'October first-month offer. View membership options.');
    banner.innerHTML = '<span class="october-offer-copy"><strong>OCTOBER OFFER</strong> $19.99 first month through Oct 22</span><span class="october-offer-clock" aria-label="Time remaining"></span>';
    const landingIntro = document.querySelector('.home-page .landing-intro');
    if (landingIntro) landingIntro.after(banner);
    else document.querySelector('.site-ticker')?.after(banner);
    if (!banner.isConnected) document.body.prepend(banner);
    const clock = banner.querySelector('.october-offer-clock');
    const renderClock = () => {
      let seconds = remaining();
      if (!seconds) return expireOffer();
      const days = Math.floor(seconds / 86400);
      seconds %= 86400;
      const hours = Math.floor(seconds / 3600);
      seconds %= 3600;
      const minutes = Math.floor(seconds / 60);
      clock.textContent = `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
    };
    renderClock();
    timer = setInterval(renderClock, 1000);

    const closePrompt = () => {
      modal?.remove();
      document.removeEventListener('keydown', onEscape);
    };
    const onEscape = (event) => { if (event.key === 'Escape') closePrompt(); };
    const showPrompt = () => {
      if (prompted || remaining() === 0) return;
      try {
        if (sessionStorage.getItem('kbh.october.offer.prompted')) return;
        sessionStorage.setItem('kbh.october.offer.prompted', '1');
      } catch { /* One prompt per page load if storage is unavailable. */ }
      prompted = true;
      modal = document.createElement('div');
      modal.className = 'october-offer-overlay';
      modal.innerHTML = '<section class="october-offer-dialog bento" role="dialog" aria-modal="true" aria-labelledby="october-offer-title"><button class="october-offer-close" type="button" aria-label="Close offer">×</button><p class="october-offer-eyebrow">OCTOBER OFFER · ENDS OCT 22, MST</p><h2 id="october-offer-title">Take a look before you go.</h2><p>VIP is $19.99 for your first month through October 22. It renews at $32.99/month until you cancel.</p><a class="button" href="' + joinUrl + '">See membership options →</a><p class="october-offer-alternative">Annual access is also available for $194.99/year until canceled.</p></section>';
      document.body.append(modal);
      modal.querySelector('button').addEventListener('click', closePrompt);
      modal.addEventListener('click', event => { if (event.target === modal) closePrompt(); });
      document.addEventListener('keydown', onEscape);
      modal.querySelector('button').focus();
    };
    document.addEventListener('mouseout', event => {
      if (event.relatedTarget || event.clientY > 8) return;
      if (matchMedia('(pointer: fine)').matches) showPrompt();
    });
    let highWater = 0;
    let lastScroll = { y: scrollY, time: performance.now() };
    addEventListener('scroll', () => {
      if (!matchMedia('(pointer: coarse)').matches || prompted) return;
      const now = performance.now();
      highWater = Math.max(highWater, scrollY);
      if (highWater > 900 && lastScroll.y - scrollY > 320 && now - lastScroll.time < 600) showPrompt();
      if (now - lastScroll.time > 600 || scrollY >= lastScroll.y) lastScroll = { y: scrollY, time: now };
    }, { passive: true });
  } else if (remaining() === 0) {
    expireOffer();
  }
})();
