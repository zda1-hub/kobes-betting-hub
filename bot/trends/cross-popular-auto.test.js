'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { eligibleSlates, scanCrossSportPopular } = require('./cross-popular-auto');

const now = new Date('2026-11-16T23:00:00Z');
const starts = '2026-11-17T00:00:00Z';
const combo = sport => ({ id: `${sport}-combo`, distinctSearchers: 5,
  legs: [{ sport, team: 'Team Alpha', player: 'Player Alpha', stat: 'receptions', side: 'over', line: 3.5 },
    { sport, team: 'Team Beta', player: 'Player Beta', stat: 'receptions', side: 'over', line: 3.5 }] });
const event = id => ({ id, home_team: 'Team Alpha', away_team: 'Team Beta', commence_time: starts });
const otherEvent = { id: 'c', home_team: 'Team Gamma', away_team: 'Team Delta', commence_time: starts };

test('largest verified slate wins among measured same-sport combinations', () => {
  const result = eligibleSlates([combo('NBA'), combo('NFL')],
    { NBA: [event('a')], NFL: [event('b'), otherEvent] }, now, '2026-11-16');
  assert.deepEqual(result.map(row => row.sport), ['NFL', 'NBA']);
  assert.equal(eligibleSlates([], { NBA: [event('a')] }, now, '2026-11-16').length, 0);
});

test('cross-sport scan sends only once on the biggest qualifying slate', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cross-popular-'));
  let sent = 0;
  const options = { root, oddsKey: 'fixture', bdlKey: 'fixture', channelId: '123456789012345678',
    channelFor: async () => ({}), now,
    readCombos: async () => ({ combos: [combo('NBA'), combo('NFL')] }),
    readEvents: async sport => ({ data: sport === 'NFL' ? [event('b'), otherEvent] : [event('a')] }),
    scanners: { NBA: async () => { sent++; return { status: 'published', messageId: 'nba' }; },
      NFL: async () => { sent++; return { status: 'published', messageId: 'nfl' }; } } };
  const first = await scanCrossSportPopular(options);
  assert.equal(first.sport, 'NFL');
  assert.equal(first.messageId, 'nfl');
  const second = await scanCrossSportPopular(options);
  assert.equal(second.existing, true);
  assert.equal(sent, 1);
  await fs.rm(root, { recursive: true, force: true });
});
