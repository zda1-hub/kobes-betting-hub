'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runCollegeCommand } = require('./college-commands');

test('all four college commands hold cleanly until the Wrangler key is present', async () => {
  for (const command of ['prop', 'player', 'matchup', 'ladder']) {
    const content = await runCollegeCommand(command, { sport: 'cbb' }, {
      createProvider: () => ({ status: async () => ({ keyConfigured: false }) }) });
    assert.equal(content, 'College data coming soon');
  }
});

test('college prop and ladder use cached completed-game analysis when available', async () => {
  const log = { player: 'Real Player', playerId: '42', team: 'Team A', date: '2026-11-15',
    season: '2026', sourceUrl: 'https://api.collegebasketballdata.com/games/players',
    stats: { points: 20 }, gameId: '1', opponent: 'Team B' };
  const row = { hits: 1, sample: 1 };
  const provider = { status: async () => ({ keyConfigured: true }),
    logs: async () => [log], stats: ['points'],
    research: async () => ({ player: log.player, lastTeam: log.team,
      sourceUrl: log.sourceUrl, analysis: { season: row, l5: row, l10: row, l20: row },
      ladder: [{ line: 10, season: row, l5: row, l10: row, l20: row },
        { line: 15, season: row, l5: row, l10: row, l20: row }] }) };
  const config = { createProvider: () => provider };
  assert.match(await runCollegeCommand('prop', { sport: 'cbb', player: 'Real Player',
    stat: 'points', line: 10 }, config), /season 1\/1/);
  assert.match(await runCollegeCommand('ladder', { sport: 'cbb', player: 'Real Player',
    stat: 'points', lines: [10, 15] }, config), /over 15/);
});
