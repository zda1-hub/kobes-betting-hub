(() => {
 const input = document.getElementById('capper-search');
  const rows = [...document.querySelectorAll('[data-capper-row]')];
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  input.addEventListener('input', () => {
    const search = normalize(input.value); let count = 0;
    for (const row of rows) { row.hidden = !normalize(row.querySelector('th').textContent).includes(search); if (!row.hidden) count += 1; }
    document.getElementById('directory-count').textContent = `${count} expert source${count === 1 ? '' : 's'} shown`;
    document.getElementById('directory-empty').hidden = count !== 0;
  });
})();
