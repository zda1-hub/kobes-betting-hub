(() => {
  const dialog = document.querySelector('[data-dialog]');
  const dialogImage = document.querySelector('[data-dialog-image]');
  let opener;
  const background = [...document.body.children].filter(el => el !== dialog && el.tagName !== 'SCRIPT');
  const closeImage = () => {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dialog-open');
    background.forEach(el => { el.inert = false; });
    dialogImage.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  };
  const openImage = card => {
    if (!dialog) return;
    opener = card;
    dialogImage.src = card.dataset.image;
    dialogImage.alt = card.querySelector('img').alt;
    document.querySelector('[data-dialog-title]').textContent = card.dataset.title;
    document.querySelector('[data-dialog-caption]').textContent = card.dataset.caption;
    document.querySelector('[data-dialog-kicker]').textContent = 'Kobe’s Betting Hub · Community proof';
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dialog-open');
    background.forEach(el => { el.inert = true; });
    dialog.querySelector('[data-dialog-close]').focus();
  };
  dialog?.querySelector('[data-dialog-close]').addEventListener('click', closeImage);
  dialog?.addEventListener('click', event => { if (event.target === dialog) closeImage(); });
  document.addEventListener('keydown', event => {
    if (!dialog || dialog.hidden) return;
    if (event.key === 'Escape') closeImage();
    if (event.key === 'Tab') { event.preventDefault(); dialog.querySelector('[data-dialog-close]').focus(); }
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-rail]').forEach(rail => {
    const track = rail.querySelector('.rail-track');
    const seen = new Set();
    [...track.children].forEach(card => {
      if (seen.has(card.dataset.image)) card.remove();
      else seen.add(card.dataset.image);
    });
    const originals = [...track.children];
    if (!originals.length) return;
    const copySet = () => originals.map(card => {
      const copy = card.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.tabIndex = -1;
      copy.querySelectorAll('a,button,input,[tabindex]').forEach(el => el.tabIndex = -1);
      return copy;
    });
    track.prepend(...copySet());
    track.append(...copySet());
    let loopWidth = 0, position = 0, lastFrame = 0, initialized = false;
    let manual = false, hovered = false, visible = true, dragging = false, suppressClick = false;
    let startX = 0, startScroll = 0, pointerId;
    const controls = document.createElement('div');
    controls.className = 'rail-controls';
    const hint = document.createElement('span'); hint.textContent = 'Swipe, drag or scroll to browse' ;
    const navigation = document.createElement('div'); navigation.className = 'rail-navigation';
    const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'rail-arrow'; previous.textContent = '←'; previous.setAttribute('aria-label', 'Previous image');
    const next = document.createElement('button'); next.type = 'button'; next.className = 'rail-arrow'; next.textContent = '→'; next.setAttribute('aria-label', 'Next image');
    navigation.append(previous, next); controls.append(hint, navigation); rail.after(controls);
    let resumeTimer;
    const setManual = value => { manual = value; clearTimeout(resumeTimer); if(value) resumeTimer=setTimeout(()=>{if(dragging || pointerId!==undefined){setManual(true);return;}manual=false;position=rail.scrollLeft;lastFrame=0;},4000); };
    const sizeImages = () => {
      const compact = !!rail.closest('.lower-bento');
      const phone = window.innerWidth <= 600;
      [...track.children].forEach(card => {
        const image = card.querySelector('img');
        if (!image?.naturalWidth || !image.naturalHeight) return;
        const ratio = image.naturalWidth / image.naturalHeight;
        const slip = card.classList.contains('slip-card');
        const maxHeight = compact ? (phone ? 210 : 280) : slip ? (phone ? 340 : 420) : (phone ? 260 : 320);
        const targetWidth = compact ? rail.clientWidth - 24 : (phone ? 320 : 420);
        const width = Math.max(1, Math.min(rail.clientWidth - 24, targetWidth, maxHeight * ratio));
        card.style.setProperty('--gallery-width', `${width}px`);
        card.style.setProperty('--gallery-height', `${width / ratio}px`);
      });
    };
    const measure = () => {
      sizeImages();
      const nextWidth = track.children[originals.length * 2].offsetLeft - track.children[originals.length].offsetLeft;
      if (!nextWidth) return;
      const fraction = loopWidth ? (rail.scrollLeft - loopWidth) / loopWidth : 0;
      loopWidth = nextWidth;
      position = loopWidth + Math.max(0, fraction) * loopWidth;
      rail.scrollLeft = position;
      initialized = true;
    };
    const normalize = () => {
      if (!loopWidth || !initialized) return;
      let next = rail.scrollLeft;
      if (next >= loopWidth * 2) next -= loopWidth;
      if (next < loopWidth) next += loopWidth;
      if (Math.abs(next - rail.scrollLeft) > 1) rail.scrollLeft = next;
      position = next;
    };
    const browseImage = direction => {
      setManual(true);
      const current = rail.scrollLeft;
      const origin = track.children[0].offsetLeft;
      const offsets = [...track.children].map(card => card.offsetLeft - origin);
      const target = direction > 0 ? offsets.find(offset => offset > current + 2) : offsets.filter(offset => offset < current - 2).at(-1);
      rail.scrollLeft = target ?? current + direction * rail.clientWidth * .7;
      normalize();
    };
    previous.addEventListener('click', () => browseImage(-1));
    next.addEventListener('click', () => browseImage(1));
    for (const type of ['touchstart','touchmove','touchend']) rail.addEventListener(type, () => setManual(true), {passive:true});
    rail.addEventListener('mouseenter', () => { hovered = true; });
    rail.addEventListener('mouseleave', () => { hovered = false; });
    rail.addEventListener('focusin', () => setManual(true));
    rail.addEventListener('touchstart', () => setManual(true), { passive: true });
    rail.addEventListener('wheel', event => {
      setManual(true);
      event.preventDefault();
      rail.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      normalize();
    }, { passive: false });
    rail.addEventListener('keydown', event => {
      if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
      setManual(true); event.preventDefault();
      rail.scrollLeft = event.key === 'Home' ? loopWidth : event.key === 'End' ? loopWidth * 2 - rail.clientWidth : rail.scrollLeft + (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * .7;
      normalize();
    });
    rail.addEventListener('pointerdown', event => {
      setManual(true);
      if (event.pointerType === 'touch' || event.button !== 0) return;
      pointerId = event.pointerId; startX = event.clientX; startScroll = rail.scrollLeft; dragging = false;
    });
    rail.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId) return;
      const distance = event.clientX - startX;
      if (!dragging && Math.abs(distance) < 5) return;
      if (!dragging) { dragging = true; rail.setPointerCapture(pointerId); rail.classList.add('is-dragging'); }
      event.preventDefault(); rail.scrollLeft = startScroll - distance;
    });
    const finish = event => {
      if (pointerId !== event.pointerId) return;
      suppressClick = dragging; dragging = false; pointerId = undefined;
      rail.classList.remove('is-dragging');
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
      normalize();
      setTimeout(() => { suppressClick = false; }, 0);
    };
    window.addEventListener('pointerup', finish);
    rail.addEventListener('pointercancel', finish);
    rail.addEventListener('scroll', () => { if (!dragging) normalize(); }, { passive: true });
    rail.addEventListener('click', event => {
      const card = event.target.closest('.media-card');
      if (card?.classList.contains('review-card')) return;
      if (!card || suppressClick) { event.preventDefault(); return; }
      setManual(true); openImage(card);
    });
    track.querySelectorAll('img').forEach(image => image.addEventListener('load', measure));
    new ResizeObserver(measure).observe(rail);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; lastFrame = 0; }).observe(rail);
    reducedMotion.addEventListener('change', () => { setManual(true); });
    document.addEventListener('visibilitychange', () => { lastFrame = 0; });
    measure(); setManual(reducedMotion.matches);
    const animate = time => {
      if (lastFrame && initialized && visible && !document.hidden && !manual && !hovered && !dragging && !reducedMotion.matches && (!dialog || dialog.hidden)) {
        position += Math.min(time-lastFrame, 50) * .065;
        rail.scrollLeft = position; normalize();
      }
      lastFrame = time; requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  });
})();
