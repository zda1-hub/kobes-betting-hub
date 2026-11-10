(() => {
  const scene = document.querySelector('.home-page .membership-scene[data-open="false"]');
  const card = scene?.querySelector('.membership-card-promo');
  if (!card) return;

  const proof = document.createElement('article');
  proof.className = 'home-writeup-proof';
  proof.setAttribute('aria-label', 'Jaylen Brown writeup example from November 4, 2026');
  proof.innerHTML = `<p class="proof-meta"><span>Real writeup example</span><time datetime="2026-11-04">Nov 4 ’26</time></p>
    <h3 class="proof-line">Jaylen Brown over 5.5 rebounds (−150)</h3>
    <a class="proof-image-link" href="assets/social/jaylen-brown-writeup-example-20261110.jpg" target="_blank" rel="noopener" aria-label="Open the original Jaylen Brown writeup image in full size">
      <img src="assets/social/jaylen-brown-writeup-example-20261110.jpg" alt="Original KBH Jaylen Brown over 5.5 rebounds writeup, showing Kobe's pregame reasons" width="1206" height="946" loading="lazy" decoding="async">
      <span>Open full-size writeup ↗</span>
    </a>
    <p class="proof-result"><span class="proof-win">✓ WIN</span><span>This play cashed. Brown finished with 7 rebounds in Philadelphia’s 112–106 win over Detroit.</span></p>
    <p class="proof-note">Posted before tip in KBH’s <a href="https://discord.com/channels/1215407647155683358/1539061878062583848/1567582256120209542" target="_blank" rel="noopener noreferrer">free-picks channel</a>. <a href="https://www.nba.com/game/0022600173/box-score" target="_blank" rel="noopener noreferrer">NBA box score</a>. Past results do not guarantee future outcomes.</p>`;
  card.after(proof);
})();
