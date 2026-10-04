const verifiedResultsTrack = document.querySelector('[data-verified-results-track]');
if (verifiedResultsTrack) {
  const rail = verifiedResultsTrack.parentElement;
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
  fetch('https://bettinghub-publisher.kobedirwin.workers.dev/api/results', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('Verified results unavailable');
      return response.json();
    })
    .then((snapshot) => {
      const results = Array.isArray(snapshot.recent) ? snapshot.recent.filter((item) => ['W', 'L', 'P', 'V'].includes(item.result)).slice(0, 16) : [];
      if (!results.length) throw new Error('No settled results available');
      const labels = { W: 'Win', L: 'Loss', P: 'Push', V: 'Void' };
      verifiedResultsTrack.replaceChildren(...results.map((item) => {
        const card = document.createElement('article');
        card.className = 'verified-result-card';
        const meta = document.createElement('span');
        meta.className = 'verified-result-meta';
        meta.textContent = `${item.date} · ${item.sport || 'Published pick'}`;
        const badge = document.createElement('b');
        badge.className = `verified-result-badge result-${item.result.toLowerCase()}`;
        badge.textContent = labels[item.result];
        const selection = document.createElement('strong');
        selection.textContent = item.selection;
        const terms = document.createElement('small');
        terms.textContent = [item.line, item.odds].filter(Boolean).join(' · ');
        card.append(meta, badge, selection);
        if (terms.textContent) card.append(terms);
        return card;
      }));
    })
    .catch(() => {
      verifiedResultsTrack.replaceChildren();
      const message = document.createElement('p');
      message.className = 'verified-results-message';
      message.textContent = 'The verified results are temporarily unavailable. View the full ledger for updates.';
      verifiedResultsTrack.append(message);
    });
}
