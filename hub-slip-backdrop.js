(() => {
  // One-switch rollback: false restores the original plain homepage on the next release.
  const ENABLED = true;
  const layer = document.querySelector('.hub-slips-backdrop');
  if (!ENABLED || !layer || !document.body.classList.contains('home-page')) return;
  document.body.classList.add('has-slip-backdrop');
  layer.hidden = false;
  const offer = document.querySelector('[data-first20-feature]');
  if (offer && !offer.hidden) {
    const band = document.createElement('div');
    band.className = 'hub-slip-top-band';
    band.setAttribute('aria-hidden', 'true');
    offer.before(band);
  }
})();
