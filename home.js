const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
menuToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-header]')) {
    menu.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

const dialog = document.querySelector('[data-dialog]');
const dialogImage = document.querySelector('[data-dialog-image]');
const dialogTitle = document.querySelector('[data-dialog-title]');
const dialogCaption = document.querySelector('[data-dialog-caption]');
const dialogKicker = document.querySelector('[data-dialog-kicker]');
let pausedRail = null;
const closeImage = () => {
  dialog.hidden = true;
  dialog.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('dialog-open');
  if (pausedRail) pausedRail.classList.remove('is-paused');
  pausedRail = null;
};
const openImage = (card) => {
  pausedRail = card.closest('[data-rail]');
  if (pausedRail) pausedRail.classList.add('is-paused');
  dialogImage.src = card.dataset.image;
  dialogImage.alt = card.querySelector('img').alt;
  dialogTitle.textContent = card.dataset.title;
  dialogCaption.textContent = card.dataset.caption;
  dialogKicker.textContent = card.closest('#community') ? 'Community' : card.closest('.recent-section') ? 'Recent picks' : 'Kobe’s Betting Hub';
  dialog.hidden = false;
  dialog.setAttribute('aria-hidden', 'false');
  document.body.classList.add('dialog-open');
  dialog.querySelector('[data-dialog-close]').focus();
};
document.querySelector('[data-dialog-close]').addEventListener('click', closeImage);
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeImage(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !dialog.hidden) closeImage(); });
document.querySelectorAll('.media-card').forEach((card) => {
  if (!card.closest('[data-rail]')) card.addEventListener('click', () => openImage(card));
});

document.querySelectorAll('[data-rail]').forEach((rail) => {
  const track = rail.querySelector('.rail-track');
  const originals = [...track.children];
  let loopWidth = 0;
  let hovered = false;
  let lastFrame = 0;
  originals.forEach((item) => {
    const copy = item.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.tabIndex = -1;
    track.append(copy);
  });
  let dragging = false;
  let moved = false;
  let suppressClick = false;
  let startX = 0;
  let startScroll = 0;
  rail.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    startScroll = rail.scrollLeft;
    moved = false;
    rail.setPointerCapture(event.pointerId);
    rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) > 5) moved = true;
    rail.scrollLeft = startScroll - distance;
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    suppressClick = moved;
    if (moved) window.setTimeout(() => { suppressClick = false; }, 0);
    rail.classList.remove('is-dragging');
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  };
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('click', (event) => {
    const card = event.target.closest('.media-card');
    if (!card) return;
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    openImage(card);
  });
  rail.addEventListener('mouseenter', () => { hovered = true; });
  rail.addEventListener('mouseleave', () => { hovered = false; });
  rail.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    }
  }, { passive:false });
  window.addEventListener('resize', () => { loopWidth = track.children[originals.length].offsetLeft; });
  window.requestAnimationFrame(() => { loopWidth = track.children[originals.length].offsetLeft; });
  const animate = (time) => {
    if (lastFrame && !dragging && !rail.classList.contains('is-paused') && loopWidth) {
      const elapsed = Math.min((time - lastFrame) / 1000, .1);
      rail.scrollLeft += elapsed * (hovered ? 20 : 38);
      if (rail.scrollLeft >= loopWidth) rail.scrollLeft -= loopWidth;
    }
    lastFrame = time;
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
});
