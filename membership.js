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
// Checkout stays closed until Stripe approval and a controlled Discord-access
// test have both passed. This prevents public visitors reaching an incomplete
// purchase flow.
const checkoutEnabled = false;
const checkoutMessage = document.querySelector('[data-checkout-message]');
const discordConnect = document.querySelector('[data-discord-connect]');
const setCheckoutMessage = (message) => { if (checkoutMessage) checkoutMessage.textContent = message; };
const checkoutState = new URLSearchParams(window.location.search).get('checkout');
const checkoutSession = new URLSearchParams(window.location.search).get('session_id');

if (checkoutState === 'success') {
  setCheckoutMessage('Your membership is confirmed. Connect Discord now to receive member access.');
  if (discordConnect && checkoutSession) {
    discordConnect.hidden = false;
    discordConnect.href = `${checkoutEndpoint.replace('/create-checkout', '')}/discord/connect?session_id=${encodeURIComponent(checkoutSession)}`;
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
  try {
    const response = await fetch(checkoutEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offer: button.dataset.checkout }) });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || 'Unable to open checkout right now.');
    window.location.assign(result.url);
  } catch (error) {
    buttons.forEach((item) => { item.disabled = false; });
    button.innerHTML = originalText;
    setCheckoutMessage(error.message || 'Unable to open checkout right now. Please try again.');
  }
}));
