const PUBLISHER_URL = 'https://bettinghub-publisher.kobesbettinghub-publisher.workers.dev';

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
      statusNode.textContent = 'NOT POSTED';
      captionNode.textContent = 'Today’s free pick has not been posted yet.';
      return;
    }
    if (!response.ok) throw new Error(`Free pick request failed: ${response.status}`);
    const pick = await response.json();
    if (!pick?.publishedDate) throw new Error('Free pick response is incomplete');

    dateNode.textContent = formatDate(pick.publishedDate);
    captionNode.textContent = pick.caption || 'Today’s free pick is live.';
    statusNode.textContent = 'LIVE';
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
    statusNode.textContent = 'UPDATING';
    captionNode.textContent = 'The free-pick service is temporarily updating. Please check back shortly.';
    console.warn('Unable to load today’s free pick.', error);
  }
}

loadFreePick();
