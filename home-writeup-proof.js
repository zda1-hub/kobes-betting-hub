(() => {
  const scene = document.querySelector('.home-page .membership-scene[data-open="false"]');
  const card = scene?.querySelector('.membership-card-promo');
  if (!card) return;

  const proof = document.createElement('article');
  proof.className = 'home-writeup-proof';
  proof.setAttribute('aria-label', 'Real KBH write-up example');
  proof.innerHTML = `<p class="proof-meta"><span>Write-up example</span><time datetime="2026-10-23" aria-label="October 23, 2026">Oct 23 ’26</time></p><strong class="proof-line">Jalen Smith over 19.5 points + rebounds (-115)</strong><ul><li>23 in the opener despite 0-for-3 from deep.</li><li>The write-up flagged Milwaukee’s paint defense.</li><li>It projected more minutes in a closer Bulls game.</li><li>It expected a back-and-forth game with a high total.</li></ul><p class="proof-result"><span>✓ WIN</span><span class="proof-result-full">14 pts + 13 reb = 27</span><span class="proof-result-compact">27 total</span></p><button class="proof-toggle" type="button" aria-expanded="false" aria-label="See all four write-up reasons">4 reasons ↓</button><p class="proof-note">Posted before tip in KBH’s #writeups. <a href="https://www.nba.com/game/chi-vs-mil-0022600099" target="_blank" rel="noopener noreferrer">NBA game recap</a>. Past results do not guarantee future outcomes.</p>`;
  card.after(proof);

  const toggle = proof.querySelector('.proof-toggle');
  toggle.addEventListener('click', () => {
    const expanded = proof.dataset.expanded !== 'true';
    proof.dataset.expanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Show less ↑' : '4 reasons ↓';
    toggle.setAttribute('aria-label', expanded ? 'Show fewer write-up reasons' : 'See all four write-up reasons');
  });
})();
