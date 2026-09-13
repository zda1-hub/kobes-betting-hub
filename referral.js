const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

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
const referralLogin = document.querySelector('[data-referral-login]');
const sandboxSite = window.location.hostname === 'kobes-betting-hub-referral-sandbox.kobedirwin.workers.dev';
const workerOrigin = sandboxSite
  ? 'https://kobes-betting-hub-checkout-referral-sandbox.kobedirwin.workers.dev'
  : 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';

if (referralLogin) referralLogin.href = `${workerOrigin}/referrals/login`;

if (/^KBH-[A-Z0-9]{10}$/.test(code) && dashboard && referralInput) {
  const referralUrl = new URL(sandboxSite ? `${window.location.origin}/join.html` : 'https://kobesbettinghub.com/join.html');
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
