(() => {
  const card = document.querySelector('.kobe-message');
  if (!card) return;
  const trigger = card.querySelector('.t-acc-head');
  const panel = card.querySelector('.t-acc-panel');
  trigger.addEventListener('click', () => {
    const open = card.getAttribute('data-open') !== 'true';
    card.setAttribute('data-open', String(open));
    trigger.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    card.querySelector('[data-message-label]').textContent = open ? 'Close full message' : 'Read my full message';
  });
})();
