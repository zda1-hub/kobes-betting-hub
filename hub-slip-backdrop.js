(() => {
  // One-switch rollback: false restores the original plain homepage on the next release.
  const ENABLED = true;
  const layer = document.querySelector('.hub-slips-backdrop');
  if (!ENABLED || !layer || !document.body.classList.contains('home-page')) return;
  document.body.classList.add('has-slip-backdrop');
  layer.hidden = false;
})();
