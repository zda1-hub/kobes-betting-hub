const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const memberReferralPromoActive = Date.now() >= Date.parse('2026-09-22T07:00:00Z') && Date.now() < Date.parse('2026-10-23T07:00:00Z');
if (memberReferralPromoActive) {
  const offerCopy = {
    lead: 'Active members receive $10 for each eligible friend who joins through their link and pays $19.99 for the first month during the offer, after verification and a seven-day hold.',
    step2: '<span>02</span>Share your personal link. Through October 22 (Arizona time), friends pay $19.99 for the first month, then $32.99/month until canceled. No free trial.',
    step3: '<span>03</span>After the first successful $19.99 payment, seven-day hold, and verification, Stripe sends your reward.',
    rules: 'The friend must be a new member using your link, select the referral offer, and successfully pay the first $19.99 charge by October 22 (Arizona time). After the offer ends, the link returns to a two-day trial; the first $32.99 payment then qualifies.'
  };
  for (const [key, value] of Object.entries(offerCopy)) {
    const element = document.querySelector(`[data-referral-offer-copy="${key}"]`);
    if (element) element.innerHTML = value;
  }
}

const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
if (menuToggle && menu) {
  menuToggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menu.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));
}

const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const query = new URLSearchParams(window.location.search);
const code = (hash.get('code') || query.get('code') || '').toUpperCase();
const auth = hash.get('auth') || '';
const setup = query.get('setup');
const dashboard = document.querySelector('[data-referral-dashboard]');
const referralInput = document.querySelector('[data-referral-link]');
const copyButton = document.querySelector('[data-copy-referral]');
const payoutSetup = document.querySelector('[data-payout-setup]');
const message = document.querySelector('[data-referral-message]');
const workerOrigin = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';

if (/^KBH-[A-Z0-9]{10}$/.test(code) && dashboard && referralInput) {
  const referralUrl = new URL('https://kobesbettinghub.com/join.html');
  referralUrl.searchParams.set('ref', code);
  dashboard.hidden = false;
  referralInput.value = referralUrl.toString();
  if (payoutSetup) payoutSetup.href = auth ? `${workerOrigin}/referrals/onboard?auth=${encodeURIComponent(auth)}` : `${workerOrigin}/referrals/login`;
  if (setup === 'complete' && message) message.textContent = 'Stripe payout setup returned successfully. Stripe may still need to verify your information before cash can be sent.';
  if (setup === 'complete' && payoutSetup) payoutSetup.innerHTML = 'Review payout setup through Discord <span aria-hidden="true">→</span>';
  if (setup === 'refresh' && message) message.textContent = 'That secure Stripe link expired. Reconnect Discord to generate a new one.';
  const cleanQuery = new URLSearchParams();
  if (setup) cleanQuery.set('setup', setup);
  if (setup && code) cleanQuery.set('code', code);
  history.replaceState(null, '', cleanQuery.size ? `${location.pathname}?${cleanQuery}` : location.pathname);
}

copyButton?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(referralInput.value);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => { copyButton.textContent = 'Copy link'; }, 1800);
  } catch {
    referralInput.select();
    document.execCommand('copy');
  }
});
