// Arizona stays on UTC−7; the published offer ends after October 21 locally.
const firstMonthPromoStart = Date.parse('2026-09-22T07:00:00Z');
const firstMonthPromoEnd = Date.parse('2026-10-22T07:00:00Z');
const firstMonthPromoParams = new URLSearchParams(window.location.search);
const firstMonthPromoActive = Date.now() >= firstMonthPromoStart && Date.now() < firstMonthPromoEnd;
const isReferralCheckout = /^(KBH|KBC)-[A-Z0-9]{10}$/i.test(firstMonthPromoParams.get('ref') || '');

if (firstMonthPromoActive && !isReferralCheckout && !firstMonthPromoParams.has('checkout')) {
  document.querySelectorAll('[data-promo-default]:not([data-promo-retain])').forEach(element => { element.hidden = true; });
  document.querySelectorAll('[data-promo-only]').forEach(element => { element.hidden = false; });
  const checkoutMessage = document.querySelector('[data-checkout-message]');
  if (checkoutMessage) checkoutMessage.textContent = 'Choose $19.99 today for your first full month, then $32.99 per month, or $10 today for the first 7 days, then $32.99 per month. Both renew until canceled. Claim the $19.99 month by October 21, 2026 (Arizona time). Neither option includes a free trial. Cancel before the next renewal through Manage membership; access continues through the paid-through date. Charges are non-refundable except where required by law, card-network rules, or a written Hub exception.';
}
