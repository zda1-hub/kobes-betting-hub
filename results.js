const RESULTS_URL = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  ? '/preview-api/results'
  : 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results';

const formatDate = value => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix',
}).format(new Date(`${value}T12:00:00-07:00`));

function winningRow(item) {
  const row = document.createElement('article');
  row.className = 'result-row';
  const day = document.createElement('span');
  day.textContent = formatDate(item.date);
  const badge = document.createElement('b');
  badge.className = 'result-badge win';
  badge.textContent = 'W';
  const selection = document.createElement('strong');
  selection.textContent = item.selection;
  const details = document.createElement('small');
  const terms = [item.line, item.odds && `(${item.odds})`].filter(Boolean).join(' ');
  details.textContent = [item.sport, terms, 'Win'].filter(Boolean).join(' · ');
  row.append(day, badge, selection, details);
  return row;
}

async function loadResults() {
  const loading = document.querySelector('[data-loading]');
  const shell = document.querySelector('[data-results]');
  try {
    const response = await fetch(RESULTS_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Results service returned ${response.status}`);
    const data = await response.json();
    const wins = (Array.isArray(data.wins) ? data.wins : data.recent || [])
      .filter(item => item.result === 'W');
    document.querySelector('[data-updated]').textContent = `Last verified sync: ${new Date(data.generatedAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST`;
    const list = document.querySelector('[data-list]');
    list.replaceChildren(...wins.map(winningRow));
    if (!wins.length) list.textContent = 'No verified winning plays are available yet.';
    loading.hidden = true;
    shell.hidden = false;
  } catch (error) {
    loading.classList.add('results-error');
    loading.innerHTML = '<strong>Winning plays are temporarily unavailable.</strong><p>Please check back shortly.</p>';
    console.warn(error);
  }
}

loadResults();
