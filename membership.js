const year = document.getElementById('year');
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

const checkoutEndpoint = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev/create-checkout';
// Live Stripe checkout is enabled. Discord access is granted only after the
// customer completes Stripe Checkout and explicitly connects their account.
const checkoutEnabled = true;
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

if (checkoutState === 'success') {
  setCheckoutMessage('Your membership is confirmed. Connect Discord now to receive member access.');
  if (discordConnect && checkoutSession) {
    discordConnect.hidden = false;
    discordConnect.setAttribute('aria-hidden', 'false');
    discordConnect.href = `${checkoutEndpoint.replace('/create-checkout', '')}/discord/connect?session_id=${encodeURIComponent(checkoutSession)}`;
    window.setTimeout(() => discordConnect.classList.add('is-ready'), 150);
  }
}
if (checkoutState === 'connected') setCheckoutMessage('Discord is connected. Your member access is ready.');
if (checkoutState === 'cancel') setCheckoutMessage('Checkout was canceled. Your membership has not been started.');

document.querySelectorAll('[data-checkout]').forEach((button) => button.addEventListener('click', async () => {
  if (!checkoutEnabled) {
    setCheckoutMessage('Checkout is being finalized. No payments are being accepted yet.');
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
      body: JSON.stringify({ offer }),
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
