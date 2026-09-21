const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createFreeWriteupBoard, freeWriteupBoardPayload, publicPreviews } = require('./free-writeup-board');

test('previews every current writeup without exposing exact wagers', () => {
  const payload = freeWriteupBoardPayload([
    { pick_id: '1', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Bijan Robinson', published_line: 'Over 4.5 receptions', published_odds_american: '-150', teaser_source: '- Higbee had 2 catches against the Giants in Week 1.\n- Blake Corum averaged 43.9 rushing yards for the Rams.\n- Over 4.5 receptions at -150 is the pick.' },
    { pick_id: '2', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Kayshon Boutte Over 38.5 yards -115', source_type: 'discord_manual', teaser_source: '- Cowboys and Giants are 6-2 ATS in the last 8 games against the Rams.' },
    { pick_id: '3', operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Old exact pick -110' },
    { pick_id: '4', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#expert-picks', sport: 'football', selection: 'Not a writeup' }
  ], '2026-09-20');
  const text = payload.embeds[0].description;
  assert.match(text, /Today’s plays/);
  assert.match(text, /PLAY 1[\s\S]*PLAY 2/);
  assert.match(text, /recent production/);
  assert.match(text, /EXACT PICK HIDDEN/);
  assert.deepEqual(publicPreviews([{ pick_id: '1', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Bijan Robinson Over 4.5 receptions', teaser_source: 'Higbee had 2 catches against the Giants in Week 1.' }], '2026-09-20'), [{ number: 1, emoji: '🏈', sport: 'football', topics: ['Recent production'] }]);
  assert.doesNotMatch(text, /Bijan|Boutte|Higbee|Blake|Corum|Giants|Cowboys|Rams|receptions|rushing yards|43\.9|6-2|4\.5|38\.5|-150|-115|Old exact|Not a writeup/);
});

test('stays empty until a writeup is published', () => {
  assert.equal(freeWriteupBoardPayload([], '2026-09-20'), null);
});

test('restart reuses the newest board and deletes duplicate bot boards', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kbh-free-board-'));
  try {
    const deleted = [];
    const edited = [];
    const board = (id) => ({ id, author: { id: 'bot' }, embeds: [{ footer: { text: 'KBH free-writeups-v1' } }], delete: async () => deleted.push(id), edit: async (payload) => { edited.push(payload); return { id }; } });
    const old = board('100');
    const current = board('200');
    const channel = { client: { user: { id: 'bot' } }, messages: { fetch: async (id) => typeof id === 'object' ? new Map([['100', old], ['200', current]]) : id === '200' ? current : null }, send: async () => { throw new Error('must not create another board'); } };
    const service = createFreeWriteupBoard({ channelFor: async () => channel, rowsFor: async () => [{ pick_id: 'pick', operating_date: '2026-09-21', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', teaser_source: '10 targets in recent games' }], stateFile: path.join(directory, 'state.json'), operatingDate: () => '2026-09-21' });
    const receipt = await service.refresh();
    assert.equal(receipt.status, 'UPDATED');
    assert.deepEqual(deleted, ['100']);
    assert.equal(edited.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
