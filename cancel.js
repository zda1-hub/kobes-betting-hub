const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
menuToggle?.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-header]')) {
    menu?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }
});

const params = new URLSearchParams(window.location.search);
const message = document.querySelector('[data-message]');
const portalLogin = document.querySelector('[data-portal-login]');
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

if (portalLogin && membershipConfig) {
  portalLogin.href = `${membershipConfig.workerOrigin}/discord/login?intent=portal`;
} else if (portalLogin) {
  portalLogin.removeAttribute('href');
  portalLogin.setAttribute('aria-disabled', 'true');
  if (message) message.textContent = 'Membership management is unavailable because this site is not configured for a valid membership environment.';
}

if (membershipConfig && params.get('portal') === 'returned' && message) {
  message.textContent = 'Your Stripe billing portal session is complete. Subscription changes will sync to Discord automatically.';
}

if (membershipConfig && params.get('portal') === 'connection_required' && message) {
  message.textContent = 'This Discord account is not linked to a membership yet. Already paid? Do not purchase again. Open the private connection link in your welcome email or original checkout confirmation, tap Connect Discord, and authorize the account you use in Kobe’s server. If you cannot find that link, contact support with your checkout email.';
}
