const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const heroExperts = document.querySelector('[data-hero-experts]');
if (heroExperts) {
  fetch('data/exclusive-directory.json', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('Exclusive directory unavailable');
      return response.json();
    })
    .then((directory) => {
      if (!Array.isArray(directory?.entries) || !directory.entries.length) return;
      const entries = [...directory.entries].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const list = document.createElement('ol');
      list.className = 'hero-experts-list';
      for (const entry of entries) {
        const item = document.createElement('li');
        item.textContent = entry.name;
        list.append(item);
      }
      heroExperts.replaceChildren(list);
      heroExperts.setAttribute('aria-label', `Alphabetical list of all ${entries.length} experts`);
    })
    .catch(() => {
      const status = heroExperts.querySelector('.hero-experts-status');
      if (status) status.textContent = 'View the published directory on the exclusives page.';
    });
}

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

document.querySelectorAll('[data-rail]').forEach((rail) => {
  const track = rail.querySelector('.rail-track');
  const originals = [...track.children];
  let loopWidth = 0;
  let manual = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dragging = false;
  let pointerX = 0;
  let scrollStart = 0;
  let lastFrame = 0;
  let autoWrite = false;
  let autoWriteUntil = 0;
  const measure = () => { loopWidth = track.children[originals.length]?.offsetLeft || 0; };
  originals.forEach((item) => {
    const copy = item.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    track.append(copy);
  });
  const normalize = () => {
    if (loopWidth && rail.scrollLeft >= loopWidth) rail.scrollLeft -= loopWidth;
    if (loopWidth && rail.scrollLeft < 0) rail.scrollLeft += loopWidth;
  };
  rail.addEventListener('pointerdown', (event) => {
    manual = true;
    if (event.pointerType === 'touch') return;
    dragging = true;
    pointerX = event.clientX;
    scrollStart = rail.scrollLeft;
    rail.setPointerCapture(event.pointerId);
    rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    event.preventDefault();
    rail.scrollLeft = scrollStart - (event.clientX - pointerX);
    normalize();
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('is-dragging');
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  };
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('wheel', (event) => {
    manual = true;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
      normalize();
    }
  }, { passive: false });
  rail.addEventListener('scroll', () => { if (!autoWrite && performance.now() > autoWriteUntil) manual = true; normalize(); }, { passive: true });
  rail.addEventListener('mouseenter', () => { manual = true; });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure, { once: true });
  new ResizeObserver(measure).observe(track);
  requestAnimationFrame(measure);
  const animate = (time) => {
    if (lastFrame && !manual && loopWidth && !document.hidden) {
      autoWrite = true;
      rail.scrollLeft += Math.min((time - lastFrame) / 1000, .1) * 50;
      normalize();
      autoWriteUntil = performance.now() + 150;
      autoWrite = false;
    }
    lastFrame = time;
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
});
