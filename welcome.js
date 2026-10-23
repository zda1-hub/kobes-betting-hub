const config = window.__KBH_MEMBERSHIP_CONFIG__;
const incomingState = new URLSearchParams(location.search).get('state');
const rememberedState = window.history.state?.kbhActivationState;
const state = incomingState || (typeof rememberedState === 'string' ? rememberedState : '');
// Keep the private activation credential in memory and out of advertising page URLs.
const publicUrl = new URL(location.href);
for (const key of ['state', 'session_id', 'code', 'token', 'auth']) publicUrl.searchParams.delete(key);
window.history.replaceState({ kbhActivationState: state }, '', `${publicUrl.pathname}${publicUrl.search}${publicUrl.hash}`);
window.dispatchEvent(new Event('kbh:tracking-url-ready'));
const title = document.querySelector('[data-title]');
const message = document.querySelector('[data-message]');
const status = document.querySelector('[data-status]');
const payment = document.querySelector('[data-payment]');
const discord = document.querySelector('[data-discord]');
const vip = document.querySelector('[data-vip]');
const openDiscord = document.querySelector('[data-open-discord]');
const vipStartGuide = document.querySelector('[data-vip-start-guide]');
const retry = document.querySelector('[data-retry]');
const support = document.querySelector('[data-support]');
let checks = 0;
async function check() {
  try {
    const response = await fetch(`${config.workerOrigin}/onboarding/status?state=${encodeURIComponent(state)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to verify activation.');
    if (data.trialActive && data.trial) {
      window.__KBH_VERIFIED_TRIAL__ = data.trial;
      try { window.KBHX?.trackTrial(data.trial); } catch { /* Optional measurement. */ }
    }
    // Only the private status endpoint's Stripe-verified paid receipt can report a purchase.
    if (data.paymentConfirmed && data.purchase) {
      window.__KBH_VERIFIED_PURCHASE__ = data.purchase;
      try { window.KBHMeta?.trackPurchase(data.purchase); } catch { /* Advertising must never block membership confirmation. */ }
      try { window.KBHX?.trackPurchase(data.purchase); } catch { /* Optional measurement. */ }
      try { window.KBHGoogle?.track('purchase', { transaction_id: data.purchase.eventId, value: data.purchase.value, currency: data.purchase.currency }); } catch { /* Optional measurement. */ }
    }
    payment.textContent = data.trialActive ? 'Free trial: Active · $0 today' : `Payment: ${data.paymentConfirmed ? 'Confirmed ✅' : 'Waiting'}`;
    discord.textContent = `Discord: ${data.discordConnected ? 'Connected ✅' : 'Waiting'}`;
    vip.textContent = `VIP: ${data.vipActive ? 'Active ✅' : data.state === 'failed' ? 'Needs attention' : 'Activating…'}`;
    if (data.state === 'active') {
      title.textContent = "You're in ✅"; message.textContent = data.trialActive ? 'Your 2-day free trial is active and Discord is connected. Then $32.99/month until canceled.' : 'Payment confirmed, Discord connected, and VIP access is active.';
      openDiscord.hidden = false; vipStartGuide.hidden = false; retry.hidden = true; support.hidden = true; return;
    }
    if (data.state === 'failed') {
      title.textContent = data.trialActive ? 'Your free trial is confirmed.' : 'Your payment is confirmed.'; message.textContent = 'We had a problem activating Discord, but you do not need to purchase again.';
      retry.hidden = !data.retryAvailable; support.hidden = false; return;
    }
    if (data.trialActive || data.paymentConfirmed) { title.textContent = data.trialActive ? 'Free trial confirmed ✅' : 'Payment confirmed ✅'; message.textContent = 'Activating your VIP access…'; }
    if (++checks < 12) setTimeout(check, 2500); else { retry.hidden = !data.retryAvailable; support.hidden = false; }
  } catch (error) { title.textContent = 'Unable to confirm this activation link'; message.textContent = 'This link is missing, expired, or temporarily unavailable. If you already paid, do not purchase again. Contact support using your checkout email.'; status.textContent = error.message; payment.textContent = 'Payment: Not verified by this link'; discord.textContent = 'Discord: Not verified by this link'; vip.textContent = 'VIP: Not verified by this link'; retry.hidden = true; openDiscord.hidden = true; vipStartGuide.hidden = true; support.hidden = false; }
}
retry.addEventListener('click', async () => {
  retry.disabled = true; status.textContent = 'Rechecking your Stripe entitlement and Discord role…';
  try {
    const response = await fetch(`${config.workerOrigin}/onboarding/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
    const data = await response.json(); status.textContent = response.ok ? 'Rechecking VIP activation…' : data.error;
    checks = 0; if (state) await check();
  } catch { status.textContent = 'Unable to reconnect. Please try again or contact support.'; support.hidden = false; }
  finally { retry.disabled = false; }
});
if (state) check(); else { title.textContent = 'An activation link is required'; message.textContent = 'Open the private activation link from your checkout. If you already paid, do not purchase again.'; payment.textContent = 'Payment: Not verified by this link'; discord.textContent = 'Discord: Not verified by this link'; vip.textContent = 'VIP: Not verified by this link'; support.hidden = false; }
