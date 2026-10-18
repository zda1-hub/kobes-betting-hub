(() => {
  const readers = new WeakMap();
  const measured = new WeakMap();
  const keyFor = reader => new URL(reader.dataset.guideUrl, location.href).pathname.split('/').pop().replace(/\.html$/, '').replace(/[^a-z0-9-]/g, '');
  // Existing backend accepts section_view. Distinct target IDs identify these
  // guide milestones without changing the backend or collecting user text.
  function measure(reader, milestone) {
    if (!window.KBHConsent?.allowed()) return;
    const sent = measured.get(reader) || new Set();
    if (sent.has(milestone)) return;
    const target = `${milestone}_${keyFor(reader).replace(/-/g, '_')}`.slice(0, 80);
    if (window.KBHAnalytics?.track('section_view', target, 'learning_reader') === true) {
      sent.add(milestone); measured.set(reader, sent);
    }
  }
  async function loadGuide(details) {
    const reader = details.querySelector('[data-guide-url]');
    measure(reader, 'guide_open');
    if (readers.has(reader)) {
      const ok = await readers.get(reader);
      if (ok) measure(reader, 'guide_load_success');
      return ok;
    }
    const task = (async () => {
      reader.setAttribute('aria-busy', 'true');
      try {
        const url = new URL(reader.dataset.guideUrl, location.href);
        if (url.origin !== location.origin) throw new Error('Guide must be local');
        const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Guide unavailable');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const main = doc.querySelector('main');
        if (!main) throw new Error('Guide content missing');
        const article = main.querySelector(':scope > .article');
        const content = article ? [article] : [...main.children].filter(node => !node.matches('.subpage-header'));
        if (!content.length) throw new Error('Guide content empty');
        const fragment = document.createDocumentFragment();
        content.forEach(node => fragment.append(node));
        fragment.querySelectorAll('script').forEach(node => node.remove());
        const prefix = `reader-${keyFor(reader)}--`;
        const ids = new Map();
        fragment.querySelectorAll('[id]').forEach(node => {
          ids.set(node.id, prefix + node.id); node.id = prefix + node.id;
        });
        const sourcePage = new URL(response.url || url.href);
        fragment.querySelectorAll('[href]').forEach(node => {
          const resolved = new URL(node.getAttribute('href'), sourcePage);
          const id = resolved.hash.slice(1);
          if (resolved.origin === sourcePage.origin && resolved.pathname === sourcePage.pathname && ids.has(id)) {
            node.setAttribute('href', `#${ids.get(id)}`);
          } else node.setAttribute('href', resolved.href);
        });
        reader.replaceChildren(fragment);
        measure(reader, 'guide_load_success');
        return true;
      } catch (_) {
        const status = document.createElement('p');
        status.className = 'learning-status'; status.setAttribute('role', 'status');
        status.textContent = 'This guide couldn’t load. Open the full guide below.';
        reader.replaceChildren(status);
        return false;
      } finally { reader.removeAttribute('aria-busy'); }
    })();
    readers.set(reader, task);
    const ok = await task;
    if (!ok) readers.delete(reader); // Reopening retries failed loads.
    return ok;
  }
  document.querySelectorAll('.learning-guide').forEach(details => {
    details.addEventListener('toggle', () => { if (details.open) void loadGuide(details); });
  });
  let navigation = 0;
  async function revealHash() {
    const current = ++navigation;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!id) return;
    if (id.startsWith('reader-')) {
      for (const reader of document.querySelectorAll('[data-guide-url]')) {
        if (id.startsWith(`reader-${keyFor(reader)}--`)) {
          const parent = reader.closest('.learning-guide'); parent.open = true;
          await loadGuide(parent); break;
        }
      }
    }
    if (current !== navigation) return;
    const target = document.getElementById(id);
    if (!target?.matches('.guide-chapter')) return;
    target.open = true;
    const summary = target.querySelector('summary');
    summary.focus({ preventScroll: true });
    // Let native disclosure layout settle before measuring the header inset.
    requestAnimationFrame(() => {
      if (current !== navigation) return;
      const inset = (document.querySelector('header')?.getBoundingClientRect().height || 0) + 20;
      scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + scrollY - inset), behavior: 'instant' });
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('[data-guide-jump]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
    // Preserve the native history entry; only repeat clicks need manual reveal.
    if (url.hash === location.hash) { event.preventDefault(); void revealHash(); }
  });
  addEventListener('hashchange', () => { void revealHash(); });
  void revealHash();
  const block = document.querySelector('.learning-page .t-stagger');
  if (block && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    block.querySelectorAll('.t-stagger-line').forEach((card, index) => {
      card.style.transitionDelay = `${index * 40}ms`;
    });
    block.classList.remove('is-shown');
    void block.offsetHeight;
    block.classList.add('is-shown');
  }
})();
