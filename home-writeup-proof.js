(() => {
  const scene = document.querySelector('.home-page .membership-scene[data-open="false"]');
  const card = scene?.querySelector('.membership-card-promo');
  if (!card) return;

  const proof = document.createElement('article');
  proof.className = 'home-writeup-proof';
  proof.setAttribute('aria-label', 'KBH write-up example');
  proof.innerHTML = `<p class="proof-meta"><span>Write-up example</span><time datetime="2026-11-04" aria-label="November 4, 2026">Nov 4 ’26</time></p><strong class="proof-line">Jaylen Brown · Philadelphia 76ers<br>Over 5.5 rebounds (-150)</strong><ul><li>The supplied writeup focused on Brown’s rebound chances.</li><li>It compared his chances against slower-paced opponents.</li><li>It looked at his recent rebounding volume and minutes.</li></ul><p class="proof-result"><span>✓ This play cashed</span><span class="proof-result-full">7 rebounds vs. Detroit</span><span class="proof-result-compact">7 rebounds</span></p><button class="proof-toggle" type="button" aria-expanded="false" aria-label="See all three write-up points">3 points ↓</button><p class="proof-note">Kobe-supplied analysis example; the historical chance-rate claims in the image were not independently verified. The KBH tracked result lists this Nov 4 pick as a win, and the <a href="https://statsdmz.nba.com/pdfs/20261104/20261104_PHIDET.pdf" target="_blank" rel="noopener noreferrer">official NBA box score</a> shows 7 rebounds. Past results do not guarantee future outcomes.</p>`;
  card.after(proof);

  const toggle = proof.querySelector('.proof-toggle');
  toggle.addEventListener('click', () => {
    const expanded = proof.dataset.expanded !== 'true';
    proof.dataset.expanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Show less ↑' : '3 points ↓';
    toggle.setAttribute('aria-label', expanded ? 'Show fewer write-up points' : 'See all three write-up points');
  });
})();
