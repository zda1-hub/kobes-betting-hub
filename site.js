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
  const referralBanner = document.createElement('a');
  referralBanner.className = 'referral-promo-banner';
  referralBanner.href = new URL('refer.html', document.currentScript?.src || location.href).href;
  referralBanner.setAttribute('aria-label', 'Earn $20 for each eligible paid referral. Get your referral link.');
  referralBanner.innerHTML = '<img src="/assets/referral/twenty-dollar.png" alt="Twenty-dollar bill — earn $20 per eligible paid referral" width="1000" height="421"><span>Earn $20 per eligible paid referral →</span>';
  const landingIntro = document.querySelector('.home-page .landing-intro');
  if (landingIntro) {
    const memberCard = document.createElement('a');
    memberCard.className = 'membership-card-promo';
    memberCard.href = '/join';
    memberCard.setAttribute('aria-label', 'Kobe’s Betting Hub VIP membership — $32.99 per month until canceled. View plans.');
    memberCard.innerHTML = '<img src="/assets/membership/orange-kbh-monthly.png" alt="Orange KBH VIP membership card — $32.99/month" width="1580" height="1000"><span>$32.99/month until canceled. View membership →</span>';
    landingIntro.after(memberCard, referralBanner);
  }
  else document.querySelector('main')?.prepend(referralBanner);
  const checkoutState = new URLSearchParams(location.search).has('checkout');
  let prompted = false;
  let exitDialog;
  const closeExitDialog = () => {
    if (!exitDialog) return;
    exitDialog.remove();
    exitDialog = null;
    document.removeEventListener('keydown', onExitEscape);
  };
  const onExitEscape = event => { if (event.key === 'Escape') closeExitDialog(); };
  const showExitDialog = () => {
    if (prompted || checkoutState || !document.querySelector('.site-header')) return;
    try {
      if (sessionStorage.getItem('kbh.referral.exit.prompted')) return;
      sessionStorage.setItem('kbh.referral.exit.prompted', '1');
    } catch { /* One prompt per page load if storage is unavailable. */ }
    prompted = true;
    const joinUrl = new URL('join.html', referralBanner.href).href;
    exitDialog = document.createElement('div');
    exitDialog.className = 'october-offer-overlay';
    exitDialog.innerHTML = `<section class="october-offer-dialog bento" role="dialog" aria-modal="true" aria-labelledby="exit-referral-title"><button class="october-offer-close" type="button" aria-label="Close message">×</button><h2 id="exit-referral-title">Take a look before you go.</h2><p>VIP is $32.99/month. With each eligible referral, you can make $20. How much money do you want to make?</p><p class="exit-referral-terms">Rewards follow the first paid month, a seven-day hold, and verification.</p><a class="button" href="${joinUrl}">See membership options →</a><a class="exit-referral-link" href="${referralBanner.href}">Get your referral link →</a></section>`;
    document.body.append(exitDialog);
    exitDialog.querySelector('button').addEventListener('click', closeExitDialog);
    exitDialog.addEventListener('click', event => { if (event.target === exitDialog) closeExitDialog(); });
    document.addEventListener('keydown', onExitEscape);
    exitDialog.querySelector('button').focus();
  };
  document.addEventListener('mouseout', event => {
    if (!event.relatedTarget && event.clientY <= 8 && matchMedia('(pointer: fine)').matches) showExitDialog();
  });
  let highWater = 0;
  let lastScroll = { y: scrollY, time: performance.now() };
  addEventListener('scroll', () => {
    if (!matchMedia('(pointer: coarse)').matches || prompted) return;
    const now = performance.now();
    highWater = Math.max(highWater, scrollY);
    if (highWater > 900 && lastScroll.y - scrollY > 320 && now - lastScroll.time < 600) showExitDialog();
    if (now - lastScroll.time > 600 || scrollY >= lastScroll.y) lastScroll = { y: scrollY, time: now };
  }, { passive: true });
})();

// Animate disclosure height in both directions without a closing snap.
document.querySelectorAll('details').forEach(details => {
  const summary = details.querySelector(':scope > summary');
  if (!summary) return;
  let animation, expanded = details.open;
  summary.addEventListener('click', event => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    const from = details.getBoundingClientRect().height;
    animation?.cancel(); expanded = !expanded;
    details.style.height = ''; details.style.overflow = 'hidden';
    details.open = true;
    const to = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height;
    animation = details.animate([{height:`${from}px`},{height:`${to}px`}], {duration:460,easing:'cubic-bezier(.22,1.12,.36,1)'});
    animation.onfinish = () => { details.open = expanded; details.style.height = ''; details.style.overflow = ''; animation = null; };
  });
});
