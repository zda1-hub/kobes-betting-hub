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
  let autoScrollLeft = rail.scrollLeft;
  let writingAutoScroll = false;
  let autoWriteUntil = 0;
  let resumeAutoAt = 0;
  let hovered = false;
  let lastFrame = 0;
  const pauseAutoFor = (milliseconds = 900) => {
    resumeAutoAt = Math.max(resumeAutoAt, performance.now() + milliseconds);
  };
  originals.forEach((item) => {
    const copy = item.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.tabIndex = -1;
    track.append(copy);
  });
  let dragging = false;
  let trackingPointer = false;
  let moved = false;
  let suppressClick = false;
  let startX = 0;
  let startScroll = 0;
  let dragMultiplier = 1;
  const measureLoop = () => {
    const firstCopy = track.children[originals.length];
    loopWidth = firstCopy ? firstCopy.offsetLeft : 0;
    if (loopWidth) autoScrollLeft = rail.scrollLeft % loopWidth;
  };
  const normalizeLoop = () => {
    if (!loopWidth) return;
    if (rail.scrollLeft >= loopWidth) rail.scrollLeft -= loopWidth;
    if (rail.scrollLeft < 0) rail.scrollLeft += loopWidth;
  };

  rail.addEventListener('pointerdown', (event) => {
    pauseAutoFor(1100);
    trackingPointer = true;
    dragging = false;
    startX = event.clientX;
    startScroll = rail.scrollLeft;
    dragMultiplier = event.pointerType === 'touch' ? 1.85 : 1.25;
    moved = false;
  });
  rail.addEventListener('pointermove', (event) => {
    if (!trackingPointer) return;
    const distance = event.clientX - startX;
    const threshold = event.pointerType === 'touch' ? 3 : 5;
    if (!dragging && Math.abs(distance) < threshold) return;
    if (!dragging) {
      dragging = true;
      moved = true;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add('is-dragging');
    }
    event.preventDefault();
    pauseAutoFor(1100);
    rail.scrollLeft = startScroll - (distance * dragMultiplier);
    normalizeLoop();
    autoScrollLeft = rail.scrollLeft;
  }, { passive:false });
  const endDrag = (event) => {
    if (!trackingPointer) return;
    trackingPointer = false;
    const didDrag = dragging;
    dragging = false;
    suppressClick = didDrag;
    pauseAutoFor(didDrag ? 900 : 500);
    if (didDrag) window.setTimeout(() => { suppressClick = false; }, 0);
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
      pauseAutoFor(1200);
      rail.scrollLeft += event.deltaY;
    }
  }, { passive:false });
  rail.addEventListener('scroll', () => {
    if (!writingAutoScroll && performance.now() > autoWriteUntil) pauseAutoFor(1100);
    normalizeLoop();
    autoScrollLeft = rail.scrollLeft;
  }, { passive:true });
  document.addEventListener('visibilitychange', () => { lastFrame = 0; });
  window.addEventListener('resize', measureLoop);
  window.addEventListener('load', measureLoop, { once:true });
  new ResizeObserver(measureLoop).observe(track);
  window.requestAnimationFrame(measureLoop);
  const animate = (time) => {
    if (lastFrame && !dragging && performance.now() >= resumeAutoAt && !rail.classList.contains('is-paused') && loopWidth) {
      const elapsed = Math.min((time - lastFrame) / 1000, .1);
      autoScrollLeft += elapsed * (hovered ? 34 : 72);
      if (autoScrollLeft >= loopWidth) autoScrollLeft -= loopWidth;
      writingAutoScroll = true;
      autoWriteUntil = performance.now() + 80;
      rail.scrollLeft = autoScrollLeft;
      writingAutoScroll = false;
    }
    lastFrame = time;
    window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
});
