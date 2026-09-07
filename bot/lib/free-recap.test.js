const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFreePickRecapEmbed, freePickRecapRows } = require('./free-recap');

const rows = [
  { pick_id: '20260907-BASEBALL-001', operating_date: '2026-09-07', published_at: '2026-09-07T18:00:00Z', destination: '#💻daily-free-play💻', post_reference: 'https://discord.com/channels/1/1539061878062583848/3', selection: 'Jacob Misiorowski', published_line: 'Over 17.5 Outs', published_odds_american: '+100', result: 'W' },
  { pick_id: '20260907-BASEBALL-002', operating_date: '2026-09-07', published_at: '2026-09-07T19:00:00Z', destination: '#daily-free-play', post_reference: 'https://discord.com/channels/1/1539061878062583848/4', selection: 'Robert Gasser', published_line: 'Over 4.5 Strikeouts', published_odds_american: '-140', result: 'L' },
  { pick_id: '20260906-BASEBALL-001', operating_date: '2026-09-06', published_at: '2026-09-06T18:00:00Z', destination: '#daily-free-play', post_reference: 'https://discord.com/channels/1/1539061878062583848/2', selection: 'Nolan McLean', published_line: 'Over 1.5 Walks Allowed', published_odds_american: '-110', result: 'W' },
  { pick_id: '20260907-FOOTBALL-001', operating_date: '2026-09-07', published_at: '2026-09-07T20:00:00Z', destination: '#nfl-writeups', post_reference: 'https://discord.com/channels/1/9/4', selection: 'Team A', published_line: 'ML', published_odds_american: '-110', result: 'W' }
];

test('creates a compact free-pick-only recap and cumulative record', () => {
  const embed = buildFreePickRecapEmbed({ date: '2026-09-07', rows, freeChannelId: '1539061878062583848' });
  assert.match(embed.description, /✅ Jacob Misiorowski Over 17.5 Outs \(\+100\)/);
  assert.match(embed.description, /❌ Robert Gasser Over 4.5 Strikeouts \(-140\)/);
  assert.match(embed.description, /\*\*Today:\*\* 1-1-0/);
  assert.match(embed.description, /\*\*Overall free-pick record:\*\* 2-1-0/);
  assert.doesNotMatch(embed.description, /nfl-writeups|Discord post|Source:|Confidence/i);
});

test('finds free posts by their channel link even when Discord channel styling changes', () => {
  assert.equal(freePickRecapRows(rows, '2026-09-07', '1539061878062583848').length, 2);
});
