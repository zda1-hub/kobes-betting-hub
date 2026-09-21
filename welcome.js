const config = window.__KBH_MEMBERSHIP_CONFIG__;
const state = new URLSearchParams(location.search).get('state') || '';
const title = document.querySelector('[data-title]');
const message = document.querySelector('[data-message]');
const status = document.querySelector('[data-status]');
const payment = document.querySelector('[data-payment]');
const discord = document.querySelector('[data-discord]');
const vip = document.querySelector('[data-vip]');
const openDiscord = document.querySelector('[data-open-discord]');
const retry = document.querySelector('[data-retry]');
const support = document.querySelector('[data-support]');
let checks = 0;
async function check() {
  try {
    const response = await fetch(`${config.workerOrigin}/onboarding/status?state=${encodeURIComponent(state)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to verify activation.');
    payment.textContent = `Payment: ${data.paymentConfirmed ? 'Confirmed ✅' : 'Waiting'}`;
    discord.textContent = `Discord: ${data.discordConnected ? 'Connected ✅' : 'Waiting'}`;
    vip.textContent = `VIP: ${data.vipActive ? 'Active ✅' : data.state === 'failed' ? 'Needs attention' : 'Activating…'}`;
    if (data.state === 'active') {
      title.textContent = "You're in ✅"; message.textContent = 'Payment confirmed, Discord connected, and VIP access is active.';
      openDiscord.hidden = false; retry.hidden = true; support.hidden = true; return;
    }
    if (data.state === 'failed') {
      title.textContent = 'Your payment is confirmed.'; message.textContent = 'We had a problem activating Discord, but you do not need to purchase again.';
      retry.hidden = !data.retryAvailable; support.hidden = false; return;
    }
    if (data.paymentConfirmed) { title.textContent = 'Payment confirmed ✅'; message.textContent = 'Activating your VIP access…'; }
    if (++checks < 12) setTimeout(check, 2500); else { retry.hidden = !data.retryAvailable; support.hidden = false; }
  } catch (error) { status.textContent = error.message; support.hidden = false; }
}
retry.addEventListener('click', async () => {
  retry.disabled = true; status.textContent = 'Rechecking your Stripe entitlement and Discord role…';
  const response = await fetch(`${config.workerOrigin}/onboarding/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
  const data = await response.json(); status.textContent = response.ok ? 'VIP activation completed.' : data.error; retry.disabled = false; checks = 0; check();
});
check();
