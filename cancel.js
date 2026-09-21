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
const lastChance = document.querySelector('[data-last-chance]');
const retention75 = document.querySelector('[data-retention-75]');
const feedback = document.querySelector('[data-feedback]');
const feedbackLogin = document.querySelector('[data-feedback-login]');
const feedbackForm = document.querySelector('[data-feedback-form]');
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
  message.textContent = 'Your Stripe billing portal session is complete. If you declined the 50% offer and finished canceling, you can accept one final 75% discount below. Eligibility is verified securely before any change is made.';
  if (lastChance) lastChance.hidden = false;
  if (retention75) retention75.href = `${membershipConfig.workerOrigin}/discord/login?intent=retention75`;
  if (feedback) feedback.hidden = false;
  if (feedbackLogin) feedbackLogin.href = `${membershipConfig.workerOrigin}/cancel/feedback-login`;
}

const feedbackToken = new URLSearchParams(globalThis.location?.hash?.replace(/^#/, '') || '').get('session') || '';
if (membershipConfig && params.get('portal') === 'feedback' && feedbackToken) {
  if (feedback) feedback.hidden = false;
  if (feedbackLogin) feedbackLogin.hidden = true;
  if (feedbackForm) feedbackForm.hidden = false;
}
feedbackForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(feedbackForm);
  const response = await fetch(`${membershipConfig.workerOrigin}/cancel/feedback`, { method: 'POST', headers: { Authorization: `Bearer ${feedbackToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: data.get('reason'), details: data.get('details'), retentionOfferShown: true }) });
  const result = await response.json();
  if (message) message.textContent = response.ok ? 'Thanks—your feedback was saved.' : result.error;
  if (response.ok) feedbackForm.hidden = true;
});

if (membershipConfig && params.get('portal') === 'retained75' && message) {
  message.textContent = 'Your cancellation was stopped and 75% off your next monthly membership invoice was applied. This one-time offer cannot be used again.';
}

if (membershipConfig && params.get('portal') === 'connection_required' && message) {
  message.textContent = 'This Discord account is not linked to a membership yet. Already paid? Do not purchase again. Open the private connection link in your welcome email or original checkout confirmation, tap Connect Discord, and authorize the account you use in Kobe’s server. If you cannot find that link, contact support with your checkout email.';
}
