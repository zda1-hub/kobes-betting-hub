const RESULTS_URL = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  ? '/preview-api/results' : 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results';
const formatDate = value => new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'America/Phoenix'}).format(new Date(`${value}T12:00:00-07:00`));
function winningRow(item) {
  const row = document.createElement('article'); row.className = 'result-row';
  const day = document.createElement('span'); day.textContent = formatDate(item.date);
  const badge = document.createElement('b'); badge.className = 'result-badge win'; badge.textContent = '✓ WIN'; badge.setAttribute('aria-label','Win');
  const selection = document.createElement('strong'); selection.textContent = item.selection;
  const details = document.createElement('small');
  details.textContent = [item.sport, item.source, item.line, item.odds && `(${item.odds})`].filter(Boolean).join(' · ');
  row.append(day, badge, selection, details); return row;
}
async function loadResults() {
  const loading = document.querySelector('[data-loading]'), shell = document.querySelector('[data-results]');
  try {
    const response = await fetch(RESULTS_URL, {cache:'no-store'});
    if (!response.ok) throw new Error(`Results service returned ${response.status}`);
    const data = await response.json();
    const wins = (Array.isArray(data.wins) ? data.wins : data.recent || []).filter(item => item.result === 'W').map(KBHResultMetadata.publicMetadata);
    document.querySelector('[data-updated]').textContent = `Last verified sync: ${new Date(data.generatedAt).toLocaleString('en-US',{timeZone:'America/Phoenix'})} MST`;
    const total = document.querySelector('[data-win-count]'); if(total) total.textContent = `${wins.length} verified wins`;
    const list = document.querySelector('[data-list]');
    const count = document.createElement('p'); count.className = 'results-count'; count.setAttribute('role','status');
    const more = document.createElement('button'); more.type='button'; more.className='button results-more'; more.textContent='Show more wins'; list.after(count,more);
    let limit=30;
    const render = () => {
      const shown=wins.slice(0,limit); list.replaceChildren(...shown.map(winningRow));
      if(!wins.length) list.textContent='Verified winning plays will appear here after their results are checked.';
      count.textContent=`${shown.length} of ${wins.length} verified wins shown.`;
      more.hidden=wins.length<=limit;
    };
    more.addEventListener('click',()=>{limit+=30;render();});
    render(); loading.hidden=true; shell.hidden=false;
  } catch(error) { loading.classList.add('results-error'); loading.innerHTML='<strong>Winning plays are temporarily unavailable.</strong><p>Please check back shortly.</p>'; console.warn(error); }
}
loadResults();
