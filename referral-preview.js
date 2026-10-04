(() => {
  if (Date.now() < Date.parse('2026-10-23T07:00:00Z')) return;
  const copy = {
    lead: 'Active members receive $10 for each eligible friend who joins through their link and completes the first $32.99 membership payment, after verification and a seven-day hold.',
    step2: '<span>02</span>Share your personal link. It offers a two-day trial, then $32.99/month until canceled.',
    step3: '<span>03</span>After the first successful $32.99 payment, seven-day hold, and verification, Stripe sends your reward.',
    rules: 'The friend must be a new member using your link, select the referral offer, finish the two-day trial, and successfully pay the first $32.99 charge.'
  };
  Object.entries(copy).forEach(([key, text]) => {
    const element = document.querySelector(`[data-referral-offer-copy="${key}"]`);
    if (element) element.innerHTML = text;
  });
})();
