(() => {
  const readers = new WeakMap();
  async function loadGuide(details) {
    const reader = details.querySelector('[data-guide-url]');
    if (readers.has(reader)) return readers.get(reader);
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
        fragment.querySelectorAll('[href]').forEach(node => {
          node.setAttribute('href', new URL(node.getAttribute('href'), response.url || url.href).href);
        });
        reader.replaceChildren(fragment);
      } catch (_) {
        reader.querySelector('.learning-status').textContent = 'This guide couldn’t load. Open the full guide below.';
        readers.delete(reader); // A later reopen can retry, while the normal link always works.
      } finally {
        reader.removeAttribute('aria-busy');
      }
    })();
    readers.set(reader, task);
    return task;
  }
  document.querySelectorAll('.learning-guide').forEach(details => {
    details.addEventListener('toggle', () => { if (details.open) loadGuide(details); });
  });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const block = document.querySelector('.learning-page .t-stagger');
    block.querySelectorAll('.t-stagger-line').forEach((card, index) => {
      card.style.transitionDelay = `${index * 40}ms`;
    });
    block.classList.remove('is-shown');
    void block.offsetHeight;
    block.classList.add('is-shown');
  }
})();
