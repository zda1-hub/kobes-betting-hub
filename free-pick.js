const PUBLISHER_URL = 'https://bettinghub-publisher.kobedirwin.workers.dev';

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
menuToggle?.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-header]')) {
    menu?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }
});

const dateNode = document.querySelector('[data-free-pick-date]');
const captionNode = document.querySelector('[data-free-pick-caption]');
const statusNode = document.querySelector('[data-free-pick-status]');
const cardNode = document.querySelector('[data-free-pick-card]');
const imageNode = document.querySelector('[data-free-pick-image]');
const textCardNode = document.querySelector('[data-free-pick-text-card]');
const selectionNode = document.querySelector('[data-free-pick-selection]');
const lineNode = document.querySelector('[data-free-pick-line]');
const eventNode = document.querySelector('[data-free-pick-event]');
const reasonNode = document.querySelector('[data-free-pick-reason]');
const placeholderNode = document.querySelector('[data-free-pick-placeholder]');

function formatDate(value) {
  const date = new Date(`${value}T12:00:00-07:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

async function loadFreePick() {
  try {
    const response = await fetch(`${PUBLISHER_URL}/api/free-pick/current`, { cache: 'no-store' });
    if (response.status === 404) {
      cardNode.hidden = true;
      imageNode.hidden = true;
      imageNode.removeAttribute('src');
      textCardNode.hidden = true;
      placeholderNode.hidden = true;
      captionNode.textContent = 'No free pick is posted right now.';
      return;
    }
    if (!response.ok) throw new Error(`Free pick request failed: ${response.status}`);
    const pick = await response.json();
    if (!pick?.publishedDate) throw new Error('Free pick response is incomplete');

    dateNode.textContent = formatDate(pick.publishedDate);
    captionNode.textContent = pick.details?.selection
      ? 'Read today’s public play and its quick breakdown.'
      : 'Today’s free pick is live.';
    statusNode.textContent = 'LIVE';
    cardNode.hidden = false;
    if (pick.imageUrl) {
      imageNode.src = pick.imageUrl;
      imageNode.hidden = false;
    } else {
      const details = pick.details || {};
      selectionNode.textContent = details.selection || details.pick || 'Approved free play';
      lineNode.textContent = [details.line, details.odds ? `(${details.odds})` : '', details.units ? `${details.units}u` : ''].filter(Boolean).join(' ');
      eventNode.textContent = [details.sport, details.event].filter(Boolean).join(' • ');
      reasonNode.textContent = details.reason || 'Published from the approved Discord pick.';
      textCardNode.hidden = false;
    }
    placeholderNode.hidden = true;
  } catch (error) {
    cardNode.hidden = true;
    captionNode.textContent = 'The free-pick service is temporarily updating. Please check back shortly.';
    console.warn('Unable to load today’s free pick.', error);
  }
}

loadFreePick();

const resultsSection = document.querySelector('[data-free-results]');

function resultEntry(item) {
  const row = document.createElement('a');
  row.className = 'free-results-entry';
  row.href = item.postUrl;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';
  const label = document.createElement('strong');
  label.textContent = item.selection;
  const details = document.createElement('span');
  const terms = [item.line, item.odds ? `(${item.odds})` : ''].filter(Boolean).join(' ');
  details.textContent = [formatDate(item.date), terms, item.netUnits === null ? '' : `+${item.netUnits.toFixed(2)} units`].filter(Boolean).join(' · ');
  row.append(label, details);
  return row;
}

function fillResultList(selector, items, empty) {
  const node = document.querySelector(selector);
  node.replaceChildren();
  if (!items.length) {
    const message = document.createElement('p');
    message.className = 'free-results-empty';
    message.textContent = empty;
    node.append(message);
    return;
  }
  node.append(...items.map(resultEntry));
}

async function loadFreePickResults() {
  try {
    const response = await fetch(`${PUBLISHER_URL}/api/free-pick/results`, { cache: 'no-store' });
    if (!response.ok) return;
    const results = await response.json();
    if (!results?.generatedAt || !results?.overall || !results?.today) return;
    const overall = results.overall;
    const today = results.today;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const phoenix = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const currentDay = `${phoenix.year}-${phoenix.month}-${phoenix.day}`;
    const todayIsCurrent = results.operatingDate === currentDay;
    document.querySelector('[data-results-overall]').textContent = `${overall.wins}–${overall.losses}`;
    document.querySelector('[data-results-overall-note]').textContent = `${overall.pushes} pushes · ${overall.voids} voids`;
    document.querySelector('[data-results-today]').textContent = todayIsCurrent ? String(today.wins) : '—';
    document.querySelector('[data-results-today-note]').textContent = todayIsCurrent
      ? `${today.losses} losses · ${today.pushes} pushes · ${today.voids} voids`
      : 'Awaiting today’s verified results';
    document.querySelector('[data-results-pending]').textContent = String(results.pending);
    document.querySelector('[data-results-updated]').textContent = `${Date.now() - Date.parse(results.generatedAt) > 15 * 60 * 1000 ? 'Last synced' : 'Updated'} ${new Date(results.generatedAt).toLocaleString()}`;
    fillResultList('[data-results-recent]', results.recentWins || [], 'No verified winning free picks yet.');
    fillResultList('[data-results-best]', results.bestWins || [], 'No verified net-unit wins yet.');
    resultsSection.hidden = false;
  } catch (error) {
    console.warn('Verified Free Pick results are temporarily unavailable.', error);
  }
}

loadFreePickResults();
