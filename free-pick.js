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
const imageNode = document.querySelector('[data-free-pick-image]');
const placeholderNode = document.querySelector('[data-free-pick-placeholder]');

function formatDate(value) {
  const date = new Date(`${value}T12:00:00-07:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

async function loadFreePick() {
  try {
    const response = await fetch(`${PUBLISHER_URL}/api/free-pick/current`, { cache: 'no-store' });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`Free pick request failed: ${response.status}`);
    const pick = await response.json();
    if (!pick?.imageUrl || !pick?.publishedDate) throw new Error('Free pick response is incomplete');

    dateNode.textContent = formatDate(pick.publishedDate);
    captionNode.textContent = pick.caption || 'Today’s free pick is live.';
    statusNode.textContent = 'LIVE';
    imageNode.src = pick.imageUrl;
    imageNode.hidden = false;
    placeholderNode.hidden = true;
  } catch (error) {
    console.warn('Unable to load today’s free pick.', error);
  }
}

loadFreePick();
