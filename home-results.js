(() => {
const setupWins = track => {
  const rail = track.parentElement, controls = rail.closest?.('section') || rail.parentElement;
  if (!controls?.querySelector('[data-wins-previous]') || !track.children.length || rail.hidden) return;
  const originals = [...track.children];
  for (const side of ['before','after']) {
    const copies = originals.map(card => { const clone = card.cloneNode(true); clone.setAttribute('aria-hidden','true'); return clone; });
    if (side === 'before') track.prepend(...copies); else track.append(...copies);
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let manual = reduced.matches, hovered = false, last = 0, loop = 0, position = 0, pointer, startX, startScroll;
  let resumeTimer;
  const pause = () => { manual = true; clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { if(pointer!==undefined){pause();return;} manual = reduced.matches; position=rail.scrollLeft;last=0; },4000); };
  const measure = () => { loop = track.children[originals.length * 2].offsetLeft - track.children[originals.length].offsetLeft; position = loop; rail.scrollLeft = position; };
  // Preserve fractional animation progress even when the browser rounds scrollLeft.
  const normalize = (value = rail.scrollLeft) => { if (!loop) return; if(value < loop) value += loop; if(value >= loop*2) value -= loop; rail.scrollLeft = value; position = value; };
  const browse = direction => { pause(); const origin = track.children[0].offsetLeft; const offsets = [...track.children].map(card => card.offsetLeft - origin); const current = rail.scrollLeft; const target = direction > 0 ? offsets.find(offset => offset > current + 2) : offsets.filter(offset => offset < current - 2).at(-1); rail.scrollLeft = target ?? current + direction * (originals[0].getBoundingClientRect().width + 12); normalize(); };
  controls.querySelector('[data-wins-previous]').addEventListener('click', () => browse(-1));
  controls.querySelector('[data-wins-next]').addEventListener('click', () => browse(1));
  rail.addEventListener('mouseenter', () => hovered = true);
  rail.addEventListener('mouseleave', () => hovered = false);
  rail.addEventListener('focusin', pause);
  for (const type of ['touchstart','touchmove','touchend']) rail.addEventListener(type, pause, {passive:true});
  rail.addEventListener('wheel', event => { pause(); event.preventDefault(); rail.scrollLeft += Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY; normalize(); }, {passive:false});
  rail.addEventListener('keydown', event => { if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();browse(event.key==='ArrowRight'?1:-1);} });
  rail.addEventListener('pointerdown', event => { pause(); if(event.pointerType==='touch'||event.button!==0) return;pointer=event.pointerId; startX=event.clientX;startScroll=rail.scrollLeft;rail.setPointerCapture(pointer); });
  rail.addEventListener('pointermove', event => { if(pointer!==event.pointerId) return;event.preventDefault();rail.scrollLeft=startScroll-(event.clientX-startX); });
  const finish = event => { if(pointer!==event.pointerId) return;pointer=undefined;if(rail.hasPointerCapture(event.pointerId))rail.releasePointerCapture(event.pointerId);normalize(); };
  rail.addEventListener('pointerup', finish);rail.addEventListener('pointercancel', finish);
  rail.addEventListener('scroll', () => { if(manual && pointer===undefined)normalize(); }, {passive:true});
  reduced.addEventListener('change', pause);
  new ResizeObserver(measure).observe(rail);measure();
  const animate = now => { if(last && !manual && !reduced.matches && !hovered && !document.hidden && pointer===undefined){const bounds=rail.getBoundingClientRect();if(bounds.top<innerHeight&&bounds.bottom>0){position+=Math.min(now-last,50)*.065;normalize(position);}}last=now;requestAnimationFrame(animate); };requestAnimationFrame(animate);
};
const verifiedResultsTrack = document.querySelector('[data-verified-results-track]');
if (verifiedResultsTrack) {
  const winsOnly = verifiedResultsTrack.hasAttribute('data-wins-only');
  if (!verifiedResultsTrack.hasAttribute('data-wins-only')) {
  const rail = verifiedResultsTrack.parentElement;
  rail.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); rail.scrollLeft += (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * .7; } });
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    dragging = true;
    startX = event.clientX;
    startScroll = rail.scrollLeft;
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    event.preventDefault();
    rail.scrollLeft = startScroll - (event.clientX - startX);
  });
  for (const name of ['pointerup', 'pointercancel']) rail.addEventListener(name, (event) => {
    if (!dragging) return;
    dragging = false;
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  });
  rail.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    rail.scrollLeft += event.deltaY;
  }, { passive: false });
  }
  fetch((['localhost','127.0.0.1','::1'].includes(location.hostname) ? '/preview-api/results' : 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results'), { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Verified results unavailable');
      return response.json();
    })
    .then((snapshot) => {
      const summary = document.querySelector('[data-home-record]');
      const record = snapshot.overall;
      if (summary && record && ['wins','losses','pushes','voids'].every(key => Number.isFinite(record[key]))) {
        summary.textContent = winsOnly ? `${record.wins} tracked wins and counting` : `${record.wins} wins · ${record.losses} losses · ${record.pushes} pushes · ${record.voids} voids`;
      }
      const since = document.querySelector('[data-tracking-since]');
      if (since && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.trackingSince || '')) {
        const date = new Date(`${snapshot.trackingSince}T12:00:00Z`);
        if (Number.isFinite(date.getTime())) since.textContent = `Since ${date.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' })}. Updates automatically as published picks are verified.`;
      }
      const settled = Array.isArray(snapshot.recent) ? snapshot.recent.filter(item => ['W','L','P','V'].includes(item.result)) : [];
      const wins = settled.filter(item => item.result === 'W').slice(0, 16);
      const results = winsOnly ? wins : settled.slice(0, 16);
      if (!results.length && !winsOnly) throw new Error('No settled results available');
      const labels = { W: 'Win', L: 'Loss', P: 'Push', V: 'Void' };
      const makeResultCard = (item) => {
        const card = document.createElement('article');
        card.className = 'verified-result-card';
        const meta = document.createElement('span');
        meta.className = 'verified-result-meta';
        meta.textContent = `${item.date} · ${item.sport || 'Published pick'}`;
        const badge = document.createElement('b');
        badge.className = `verified-result-badge result-${item.result.toLowerCase()}`;
        badge.textContent = item.result === 'W' ? '✓ WIN' : labels[item.result];
        const selection = document.createElement('strong');
        selection.textContent = item.selection;
        const terms = document.createElement('small');
        terms.textContent = [item.line, item.odds].filter(Boolean).join(' · ');
        card.append(meta, badge, selection);
        if (terms.textContent) card.append(terms);
        return card;
      };
      verifiedResultsTrack.replaceChildren(...results.map(makeResultCard));
      if (results.length && winsOnly) setupWins(verifiedResultsTrack);
      if (!results.length) verifiedResultsTrack.textContent = "No recent verified wins are available.";
      const winsTrack = document.querySelector("[data-wins-track]");
      if (winsTrack) {
        winsTrack.replaceChildren(...wins.map(makeResultCard));
        if (!wins.length) winsTrack.textContent = "No recent verified wins are available.";
        else setupWins(winsTrack);
      }
    })
    .catch(() => {
      const summary = document.querySelector('[data-home-record]');
      if (summary) summary.textContent = 'The published record is temporarily unavailable.';
      const winsTrack = document.querySelector('[data-wins-track]');
      if (winsTrack) winsTrack.textContent = 'Verified wins are temporarily unavailable.';
      document.querySelectorAll('[data-wins-previous],[data-wins-next],[data-wins-motion]').forEach(button => button.disabled = true);
      verifiedResultsTrack.replaceChildren();
      const message = document.createElement('p');
      message.className = 'verified-results-message';
      message.textContent = 'The verified results are temporarily unavailable. View the full ledger for updates.';
      verifiedResultsTrack.append(message);
    });
}

})();
