(() => {
  const localPreview = ['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname) || location.protocol === 'file:';
  document.querySelectorAll('[data-year], #year').forEach(node => node.textContent = new Date().getFullYear());
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const closeMenu = () => { menu?.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); };
  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => { if (!event.target.closest('[data-header]')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.classList.contains('is-open')) { closeMenu(); toggle.focus(); }
  });
  if (localPreview) document.querySelectorAll('[data-preview-plan]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('[data-checkout-message]').textContent = 'This is a local design preview. No checkout opened and no charge was made.';
  }));
  if (localPreview) document.querySelector('[data-email-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    document.querySelector('[data-email-message]').textContent = 'Preview only — your email has not been submitted. The free-pick card above is available to browse.';
  });
})();
