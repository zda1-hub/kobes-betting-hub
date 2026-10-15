(() => {
  // Revert the regular site by setting this switch to false. The dedicated
  // /join?deal=first20 link and backend eligibility remain independent.
  const FEATURE_FIRST20 = true;
  const params = new URLSearchParams(window.location.search);
  const now = Date.now();
  if (!FEATURE_FIRST20 || now < Date.parse('2026-10-15T07:00:00Z')
      || now >= Date.parse('2026-10-19T17:00:00Z')
      || params.has('ref') || params.has('checkout')
      || !document.querySelector('[data-primary-membership-checkout]')) return;
  window.__KBH_FIRST20_FEATURED__ = true;
  const restore = [];
  const replaceText = (element, value) => {
    if (!element) return;
    const previous = element.textContent;
    restore.push(() => { element.textContent = previous; });
    element.textContent = value;
  };
  const banner = document.createElement('aside');
  banner.className = 'first20-feature';
  banner.dataset.first20Feature = '';
  banner.setAttribute('aria-label', 'Limited first-month membership offer');
  banner.innerHTML = '<div class="first20-feature-copy"><strong class="first20-feature-badge">20 MEMBERS ONLY</strong><p><b>$5</b> for your first month.</p><small>Then $32.99/month until canceled. No free trial.</small></div><a class="button" href="/join?deal=first20">Get the $5 deal <span aria-hidden="true">→</span></a><p class="first20-feature-deadline">Ends Oct 19, 10 AM MST, or after 20 redemptions.</p>';
  const ticker = document.querySelector('.site-ticker');
  (ticker || document.querySelector('.site-header'))?.after(banner);
  const label = document.createElement('p');
  label.className = 'first20-feature-badge first20-scene-badge';
  label.dataset.first20Feature = '';
  label.textContent = '20 MEMBERS ONLY · $5 FIRST MONTH';
  document.querySelector('.scene-promise')?.before(label);
  // The card remains the same artwork; its accessible description matches
  // the temporary offer instead of announcing the regular free trial.
  document.querySelectorAll('.membership-card-promo > span').forEach(span => {
    replaceText(span, '$5 first month, then $32.99/month. View membership →');
  });
  document.querySelectorAll('.membership-card-promo[aria-label]').forEach(card => {
    const previous = card.getAttribute('aria-label');
    restore.push(() => card.setAttribute('aria-label', previous));
    card.setAttribute('aria-label', 'Kobe’s Betting Hub VIP membership — $5 first month, then $32.99 per month until canceled. First 20 members only. View plans.');
  });
  replaceText(document.querySelector('.membership-tile strong'), '$5 FIRST MONTH · HUB VIP');
  replaceText(document.querySelector('.membership-tile > span'), '20 members only. Then $32.99/month until canceled.');
  window.__KBH_RESTORE_FIRST20_FEATURE__ = () => {
    document.querySelectorAll('[data-first20-feature]').forEach(element => { element.hidden = true; });
    restore.forEach(reset => reset());
  };
})();
