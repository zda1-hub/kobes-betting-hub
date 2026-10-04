// Preserve the deployed referral onboarding; local previews never connect accounts.
(() => {
  const localPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  const login = document.querySelector('[data-referral-login]');
  const preview = document.querySelector('[data-referral-preview]');
  if (localPreview) {
    if (preview) preview.hidden = false;
    if (login) { login.removeAttribute('href'); login.setAttribute('aria-disabled', 'true'); login.tabIndex = -1; }
    return;
  }
  if (login) {
    login.href = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev/referrals/login';
    login.removeAttribute('aria-disabled');
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

})();
