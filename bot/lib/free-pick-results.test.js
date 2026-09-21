const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFreePickResults } = require('./free-pick-results');

const channelId = '1234567890';
const row = (id, result, extra = {}) => ({
  pick_id: id,
  operating_date: '2026-09-21',
  published_at: '2026-09-21T17:00:00Z',
  post_reference: `https://discord.com/channels/999/${channelId}/${id}`,
  status: result === 'PENDING' ? 'PUBLISHED' : 'GRADED',
  result,
  selection: `Pick ${id}`,
  published_line: '+3.5',
  published_odds_american: '-110',
  units_risked: '1',
  result_verified_source: result === 'PENDING' ? '' : 'ESPN final box score',
  result_verified_at: result === 'PENDING' ? '' : '2026-09-21T22:00:00Z',
  ...extra,
});

test('free pick results count only published channel posts with recorded verification', () => {
  const rows = [
    row('101', 'W', { net_units: '0.91' }),
    row('102', 'L'),
    row('103', 'PENDING'),
    row('104', 'W', { result_verified_source: '' }),
    row('105', 'W', { post_reference: 'https://discord.com/channels/999/other/105' }),
    row('106', 'W', { published_at: '' }),
    row('107', 'W', { operating_date: '2026-09-20', net_units: '2.00' }),
  ];
  const result = buildFreePickResults(rows, '2026-09-21', channelId, new Date('2026-09-21T23:00:00Z'));
  assert.deepEqual(result.overall, { wins: 2, losses: 1, pushes: 0, voids: 0 });
  assert.deepEqual(result.today, { wins: 1, losses: 1, pushes: 0, voids: 0 });
  assert.equal(result.pending, 2);
  assert.deepEqual(result.bestWins.map((win) => win.selection), ['Pick 107', 'Pick 101']);
  assert.equal(result.recentWins[0].selection, 'Pick 101');
});
