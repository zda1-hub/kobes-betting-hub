(() => {
  const pixelId = '4640857832799621';
  if (window.fbq) return;

  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  };
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(script, firstScript);

  fbq('init', pixelId);
  fbq('track', 'PageView');

  // Checkout remains authoritative in Stripe. This browser event measures
  // intent only and never grants access or records a purchase.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-checkout]');
    if (!button || button.disabled) return;
    fbq('track', 'InitiateCheckout', {
      content_name: `Kobe's Betting Hub ${String(button.dataset.checkout || 'membership')}`,
      content_category: 'VIP membership',
      currency: 'USD'
    });
  });
})();
