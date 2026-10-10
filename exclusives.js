(() => {
  const input = document.getElementById('capper-search');
  const rows = [...document.querySelectorAll('[data-capper-row]')];
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let limit = 12;
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'button directory-more'; more.textContent = 'Show more sources';
  document.querySelector('.directory-table-scroll').after(more);
  const render = () => {
    const matches = rows.filter(row => normalize(row.querySelector('th').textContent).includes(normalize(input.value)));
    const visible = new Set(matches.slice(0, limit));
    rows.forEach(row => row.hidden = !visible.has(row));
    document.getElementById('directory-count').textContent = `${visible.size} of ${matches.length} expert source${matches.length === 1 ? '' : 's'} shown`;
    document.getElementById('directory-empty').hidden = matches.length !== 0;
    more.hidden = matches.length <= limit;
  };
  input.addEventListener('input', () => { limit = 12; render(); });
  more.addEventListener('click', () => { limit += 12; render(); });
  render();
})();
