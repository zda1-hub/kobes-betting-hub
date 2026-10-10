(() => {
const year = document.getElementById('year');
// Wait until the shared header, styles and fonts are loaded before aligning
// a direct pricing link. Browser scroll restoration can otherwise cover it.
const alignOfferAnchor = () => {
  if (window.location.hash !== '#offer') return;
  const offer = document.getElementById('offer');
  if (!offer) return;
  const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
  window.scrollTo({ top: Math.max(0, offer.getBoundingClientRect().top + window.scrollY - headerBottom - 12), behavior: 'auto' });
};
window.addEventListener('load', alignOfferAnchor);
window.addEventListener('hashchange', alignOfferAnchor);
if (year) year.textContent = new Date().getFullYear();
// Navigation is handled once by site.js.
const productionMembershipWorkerOrigin = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';
const membershipConfig = (() => {
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.protocol === 'file:') return null;
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
const checkoutEndpoint = membershipConfig ? `${membershipConfig.workerOrigin}/checkout/prepare` : null;
// Live Stripe checkout is enabled. Discord access is granted only after the
// customer completes Stripe Checkout and explicitly connects their account.
const checkoutEnabled = Boolean(checkoutEndpoint);
const checkoutMessage = document.querySelector('[data-checkout-message]');
const discordConnect = document.querySelector('[data-discord-connect]');
const connectionPanel = document.querySelector('[data-membership-confirmation]');
const connectionTitle = document.querySelector('[data-connection-title]');
const connectionMessage = document.querySelector('[data-connection-message]');
const showConnectionPanel = (title, message) => {
  if (connectionPanel) connectionPanel.hidden = false;
  if (connectionTitle) connectionTitle.textContent = title;
  if (connectionMessage) connectionMessage.textContent = message;
  document.querySelectorAll('[data-membership-sales]').forEach(section => { section.hidden = true; });
  document.querySelectorAll('[data-checkout]').forEach(button => { button.disabled = true; });
};
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
const checkoutSession = new URLSearchParams(window.location.search).get('session_id')
  || (checkoutState === 'success' && typeof window.history?.state?.kbhCheckoutSession === 'string' ? window.history.state.kbhCheckoutSession : null);
if (checkoutSession) {
  const publicUrl = new URL(window.location.href);
  publicUrl.searchParams.delete('session_id');
  window.history?.replaceState({ kbhCheckoutSession: checkoutSession }, '', `${publicUrl.pathname}${publicUrl.search}${publicUrl.hash}`);
  window.dispatchEvent?.(new Event('kbh:tracking-url-ready'));
}
const requestedReferralCode = (new URLSearchParams(window.location.search).get('ref') || '').toUpperCase();
const referralCode = /^(KBH|KBC)-[A-Z0-9]{10}$/.test(requestedReferralCode) ? requestedReferralCode : '';
if (referralCode && !checkoutState) {
  const referralGrid = document.querySelector('.offer-card-grid');
  if (referralGrid) {
    referralGrid.querySelectorAll('.offer-choice:not(.offer-choice-referral)').forEach(card => { card.hidden = true; });
    const secondaryOffers = referralGrid.querySelector('.secondary-offers');
    if (secondaryOffers) secondaryOffers.hidden = true;
    const referralCard = referralGrid.querySelector('[data-referral-card]');
    if (referralCard) referralCard.hidden = false;
    const referralButton = referralCard?.querySelector('[data-referral-button]');
    if (referralButton) referralButton.dataset.checkout = 'monthly';
    setCheckoutMessage('Referral link: $32.99 today, then $32.99/month until canceled. No free trial.');
  }
}

if (checkoutState === 'success') {
  const validSession = /^cs_(live|test)_[A-Za-z0-9_]+$/.test(checkoutSession || '');
  const message = validSession && membershipConfig
    ? 'One more step: tap Connect Discord and authorize your account. Stripe verifies your membership before access is granted.'
    : 'This connection link is incomplete. Open the private link in your welcome email or contact support with your checkout email. Do not purchase again.';
  setCheckoutMessage(message);
  showConnectionPanel('Connect your Discord.', message);
  if (discordConnect && validSession && membershipConfig) {
    discordConnect.hidden = false;
    discordConnect.setAttribute('aria-hidden', 'false');
    discordConnect.href = `${membershipConfig.workerOrigin}/discord/connect?session_id=${encodeURIComponent(checkoutSession)}`;
  }
}
if (checkoutState === 'connected') {
  const message = 'Discord authorization is complete. Open Kobe’s server using the same Discord account to see your member channels. If access is missing, contact support—do not pay again.';
  setCheckoutMessage(message);
  showConnectionPanel('Discord connected.', message);
}
if (checkoutState === 'cancel') setCheckoutMessage('Checkout was canceled. Your membership has not been started.');

document.querySelectorAll('[data-checkout]').forEach((button) => button.addEventListener('click', async () => {
  if (['success', 'connected'].includes(checkoutState)) return;
  if (!checkoutEnabled) {
    setCheckoutMessage(['localhost','127.0.0.1','[::1]'].includes(window.location.hostname) || window.location.protocol === 'file:' ? 'This is a local design preview. No checkout opened and no charge was made.' : 'This page is not configured for a valid membership environment. Please contact support.');
    return;
  }
  const buttons = [...document.querySelectorAll('[data-checkout]')];
  const originalText = button.innerHTML;
  buttons.forEach((item) => { item.disabled = true; });
  button.textContent = 'Connecting Discord…';
  setCheckoutMessage('Step 1 of 2: connect the Discord account you want to use for Kobe’s VIP. No VIP access is granted until Stripe confirms your eligible payment.');
  const offer = button.dataset.checkout;
  const deal = button.dataset.deal === 'first20' ? 'first20' : '';
  const requestKey = deal ? `${offer}:${deal}` : offer;
  const requestId = checkoutRequestId(requestKey);
  try {
    const response = await fetch(checkoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Checkout-Request-Id': requestId },
      body: JSON.stringify({
        offer,
        ...(deal ? { deal } : {}),
        ...(offer === 'monthly' && referralCode ? { referral_code: referralCode } : {}),
        analytics_session_id: window.KBHConsent?.allowed() ? window.KBHAnalytics?.sessionId || null : null,
        attribution: window.KBHConsent?.allowed() ? window.KBHAnalytics?.attribution || {} : {},
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.url) {
      if (response.status >= 400 && response.status < 500) clearCheckoutRequestId(requestKey);
      throw new Error(result.error || 'Unable to open checkout right now.');
    }
    const redirectUrl = new URL(result.url);
    if (redirectUrl.protocol !== 'https:' || !['discord.com', 'discordapp.com', 'checkout.stripe.com'].includes(redirectUrl.hostname)) {
      throw new Error('Checkout returned an invalid destination. Please try again.');
    }
    // The confirmed preparation starts the Discord-first checkout journey.
    // This intent event does not report a purchase or grant membership access.
    try { window.KBHMeta?.trackCheckout(offer, requestId); } catch { /* Advertising must never block checkout. */ }
    clearCheckoutRequestId(requestKey);
    window.location.assign(result.url);
  } catch (error) {
    buttons.forEach((item) => { item.disabled = false; });
    button.innerHTML = originalText;
    setCheckoutMessage(error.message || 'Unable to open checkout right now. Please try again.');
  }
}));

})();
