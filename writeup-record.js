(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    const targets = [...document.querySelectorAll('[data-writeup-record]')];
    if (!targets.length) return;
    const origin = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
      ? '/preview-api/results' : 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results';
    root.KBHVerifiedResults = root.KBHVerifiedResults || fetch(origin, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Results unavailable');
      return response.json();
    });
    const paint = model => targets.forEach(target => {
      target.querySelector('[data-writeup-rate]').textContent = model.rate;
      target.querySelector('[data-writeup-detail]').textContent = model.detail;
      target.querySelector('[data-writeup-period]').textContent = model.period;
    });
    root.KBHVerifiedResults.then(snapshot => paint(api.presentation(snapshot))).catch(() => paint(api.unavailable()));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const unavailable = () => ({ rate: '—', detail: 'Writeup record unavailable. No percentage estimated.', period: 'Expert picks are excluded from this statistic.' });
  function presentation(snapshot, now = Date.now()) {
    const r = snapshot?.writeupRecord;
    const generated = Date.parse(snapshot?.generatedAt || '');
    if (!r || r.scope !== 'writeup_channels' || !['wins','losses','pushes','voids','pending'].every(k => Number.isSafeInteger(r[k]) && r[k] >= 0)
      || !Number.isFinite(generated) || generated > now + 300000 || now - generated > 48 * 3600000
      || !/^\d{4}-\d{2}-\d{2}$/.test(r.through || '')
      || (r.trackingSince !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(r.trackingSince || '') || r.trackingSince > r.through))) return unavailable();
    const decided = r.wins + r.losses;
    const date = value => new Date(value + 'T12:00:00-07:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' });
    return {
      rate: decided ? `${(100 * r.wins / decided).toFixed(1)}%` : '—',
      detail: `${r.wins} wins · ${r.losses} losses · ${decided} decided writeups. ${r.pushes} pushes · ${r.voids} voids · ${r.pending} pending.`,
      period: `${r.trackingSince ? `${date(r.trackingSince)}–${date(r.through)}` : 'No tracked writeups yet'}. Win rate = wins ÷ (wins + losses). ${decided ? '' : 'No settled win/loss percentage yet. '}Last sync ${new Date(generated).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST. Tracked writeup-channel plays; excludes expert-only picks. Past results do not guarantee future outcomes.`,
    };
  }
  return { presentation, unavailable };
});
