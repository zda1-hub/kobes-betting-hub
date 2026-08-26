const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLogRecapEmbeds, buildRecapEmbed, makeResults } = require('./recap');

const recap = {
  date: '2026-08-17',
  record: '2-1-0 (+0.85u)',
  results: 'W — #1 — Player OVER 6.5 Ks\nL — #2 — Team ML\nW — #3 — Player points',
  summary: '2-1 yesterday 🙏',
  imageUrl: 'https://example.com/recap.png'
};

test('formats a verified recap', () => {
  assert.match(makeResults(recap.results), /^• W — #1/m);
  assert.equal(buildRecapEmbed(recap).title, 'Daily Recap — 2026-08-17');
});

test('requires ISO date and results', () => {
  assert.throws(() => buildRecapEmbed({ ...recap, date: 'tomorrow' }), /YYYY-MM-DD/);
  assert.throws(() => makeResults(''), /1–30 verified results/);
});

test('builds a complete multi-channel recap from the canonical pick log', () => {
  const rows = [
    { pick_id: '20260825-BASEBALL-001', operating_date: '2026-08-25', published_at: '2026-08-25T17:00:00Z', destination: '#daily-free-play', selection: 'Player A', published_line: 'OVER 1.5 hits', published_odds_american: '+120', units_risked: '1', result: 'W', net_units: '1.2', post_reference: 'https://discord.com/channels/1/2/3', result_verified_source: 'Official MLB box score' },
    { pick_id: '20260825-FOOTBALL-002', operating_date: '2026-08-25', published_at: '2026-08-25T17:01:00Z', destination: '#nfl-writeups', selection: 'Team B', published_line: '-3.5', published_odds_american: '-110', units_risked: '1', result: 'L', net_units: '-1', post_reference: 'https://discord.com/channels/1/4/5', result_verified_source: 'Official NFL gamebook' },
    { pick_id: '20260825-BASEBALL-003', operating_date: '2026-08-25', published_at: '2026-08-25T17:02:00Z', destination: '#mlb-writeups', selection: 'Team C', published_line: 'ML', published_odds_american: '-105', units_risked: '2', result: 'P', net_units: '0', post_reference: 'https://discord.com/channels/1/6/7', result_verified_source: 'Official MLB box score' },
    { pick_id: '20260825-FOOTBALL-004', operating_date: '2026-08-25', published_at: '2026-08-25T17:03:00Z', destination: '#nfl-writeups', selection: 'Player D', published_line: 'OVER 55.5 yards', published_odds_american: '-115', units_risked: '1', result: 'PENDING', net_units: '', post_reference: 'https://discord.com/channels/1/4/8', result_verified_source: '' }
  ];
  const embeds = buildLogRecapEmbeds({ date: '2026-08-25', rows, summary: 'Private test only.' });
  const text = embeds.map((embed) => `${embed.title}\n${embed.description}`).join('\n');
  assert.match(text, /Official record:\*\* 1-1-1/);
  assert.match(text, /Overall net units:\*\* \+0.20u/);
  for (const row of rows) assert.match(text, new RegExp(row.pick_id));
  assert.match(text, /#daily-free-play/);
  assert.match(text, /#nfl-writeups/);
  assert.match(text, /PENDING/);
});
