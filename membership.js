const year = document.getElementById('year');
// Wait until the shared header, styles and fonts are loaded before aligning
// a direct pricing link. Browser scroll restoration can otherwise cover it.
const alignOfferAnchor = () => {
  if (window.location.hash !== '#offer') return;
  document.getElementById('offer')?.scrollIntoView({ block: 'start' });
};
window.addEventListener('load', alignOfferAnchor);
window.addEventListener('hashchange', alignOfferAnchor);
if (year) year.textContent = new Date().getFullYear();
const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-header]')) {
    menu.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

const productionMembershipWorkerOrigin = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';
const membershipConfig = (() => {
  const config = window.__KBH_MEMBERSHIP_CONFIG__;
  if (!config || !['production', 'staging'].includes(config.environment)) return null;
  try {
    const origin = new URL(config.workerOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== config.workerOrigin || origin.username || origin.password) return null;
    if (config.environment === 'production' && config.workerOrigin !== productionMembershipWorkerOrigin) return null;
    if (config.environment === 'staging' && config.workerOrigin === productionMembershipWorkerOrigin) return null;
    return { environment: config.environment, workerOrigin: config.workerOrigin };
  } catch {
    return null;
  }
})();
const checkoutEndpoint = membershipConfig ? `${membershipConfig.workerOrigin}/create-checkout` : null;
// Live Stripe checkout is enabled. Discord access is granted only after the
// customer completes Stripe Checkout and explicitly connects their account.
const checkoutEnabled = Boolean(checkoutEndpoint);
const checkoutMessage = document.querySelector('[data-checkout-message]');
const discordConnect = document.querySelector('[data-discord-connect]');
const setCheckoutMessage = (message) => { if (checkoutMessage) checkoutMessage.textContent = message; };
const checkoutRequestStorageKey = (offer) => `kbh.checkout.request.${offer}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checkoutRequestIds = new Map();
const checkoutRequestId = (offer) => {
  const storageKey = checkoutRequestStorageKey(offer);
  if (uuidPattern.test(checkoutRequestIds.get(offer) || '')) return checkoutRequestIds.get(offer);
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (uuidPattern.test(existing || '')) {
      checkoutRequestIds.set(offer, existing.toLowerCase());
      return existing.toLowerCase();
    }
  } catch { /* Continue without browser storage when it is unavailable. */ }
  const requestId = window.crypto.randomUUID();
  checkoutRequestIds.set(offer, requestId);
  try { window.sessionStorage.setItem(storageKey, requestId); } catch { /* The request remains idempotent for this page load. */ }
  return requestId;
};
const clearCheckoutRequestId = (offer) => {
  checkoutRequestIds.delete(offer);
  try { window.sessionStorage.removeItem(checkoutRequestStorageKey(offer)); } catch { /* Browser storage may be unavailable. */ }
};
const checkoutState = new URLSearchParams(window.location.search).get('checkout');
const checkoutSession = new URLSearchParams(window.location.search).get('session_id');
const requestedReferralCode = (new URLSearchParams(window.location.search).get('ref') || '').toUpperCase();
const referralCode = /^KBH-[A-Z0-9]{10}$/.test(requestedReferralCode) ? requestedReferralCode : '';

if (referralCode && !checkoutState) {
  const starterButton = document.querySelector('[data-checkout="starter"]');
  const trialButton = document.querySelector('[data-checkout="trial_2_day"]');
  const offerBadge = document.querySelector('.offer-badge');
  const priceDescription = document.querySelector('.membership-price span');
  if (starterButton) starterButton.hidden = true;
  document.querySelectorAll('[data-term-plans], [data-term-note]').forEach(element => { element.hidden = true; });
  if (trialButton) {
    trialButton.dataset.checkout = 'referral_trial';
    trialButton.innerHTML = 'Start with 2 days free <span aria-hidden="true">→</span>';
  }
  if (offerBadge) offerBadge.innerHTML = '<strong>MEMBER REFERRAL</strong><span>Exclusive two-day free trial</span>';
  if (priceDescription) priceDescription.textContent = 'per month after your 2-day free trial';
  setCheckoutMessage('Referral offer: 2 days free, then $32.99/month until canceled. The $10 starter option is not available with referrals.');
}

if (checkoutState === 'success') {
  setCheckoutMessage('Your membership is confirmed. Connect Discord now to receive member access.');
  if (discordConnect && checkoutSession && membershipConfig) {
    discordConnect.hidden = false;
    discordConnect.setAttribute('aria-hidden', 'false');
    discordConnect.href = `${membershipConfig.workerOrigin}/discord/connect?session_id=${encodeURIComponent(checkoutSession)}`;
    window.setTimeout(() => discordConnect.classList.add('is-ready'), 150);
  }
}
if (checkoutState === 'connected') setCheckoutMessage('Discord is connected. Your member access is ready.');
if (checkoutState === 'cancel') setCheckoutMessage('Checkout was canceled. Your membership has not been started.');

document.querySelectorAll('[data-checkout]').forEach((button) => button.addEventListener('click', async () => {
  if (!checkoutEnabled) {
    setCheckoutMessage('Checkout is unavailable because this site is not configured for a valid membership environment.');
    return;
  }
  const buttons = [...document.querySelectorAll('[data-checkout]')];
  const originalText = button.innerHTML;
  buttons.forEach((item) => { item.disabled = true; });
  button.textContent = 'Opening secure checkout…';
  setCheckoutMessage('Opening Stripe’s secure checkout…');
  const offer = button.dataset.checkout;
  const requestId = checkoutRequestId(offer);
  try {
    const response = await fetch(checkoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Checkout-Request-Id': requestId },
      body: JSON.stringify({ offer, ...(offer === 'referral_trial' ? { referral_code: referralCode } : {}) }),
    });
    const result = await response.json();
    if (!response.ok || !result.url) {
      if (response.status >= 400 && response.status < 500) clearCheckoutRequestId(offer);
      throw new Error(result.error || 'Unable to open checkout right now.');
    }
    clearCheckoutRequestId(offer);
    window.location.assign(result.url);
  } catch (error) {
    buttons.forEach((item) => { item.disabled = false; });
    button.innerHTML = originalText;
    setCheckoutMessage(error.message || 'Unable to open checkout right now. Please try again.');
  }
}));
