(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const closeMenu = () => { menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', String(menu.classList.toggle('is-open'))));
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => { if (!event.target.closest('[data-header]')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  const input = document.getElementById('capper-search');
  const rows = [...document.querySelectorAll('[data-capper-row]')];
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  input.addEventListener('input', () => {
    const search = normalize(input.value); let count = 0;
    for (const row of rows) { row.hidden = !normalize(row.querySelector('th').textContent).includes(search); if (!row.hidden) count += 1; }
    document.getElementById('directory-count').textContent = `${count} ${count === 1 ? 'capper' : 'cappers'} shown`;
    document.getElementById('directory-empty').hidden = count !== 0;
  });
})();
