const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createFreeWriteupBoard, freeWriteupBoardPayload, publicPreviews } = require('./free-writeup-board');

test('formats every current writeup as its own full-width redacted preview', () => {
  const payload = freeWriteupBoardPayload([
    { pick_id: '1', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Bijan Robinson', published_line: 'Over 4.5 receptions', published_odds_american: '-150', teaser_source: '- Higbee had 2 catches against the Giants in Week 1.\n- Blake Corum averaged 43.9 rushing yards for the Rams.\n- Over 4.5 receptions at -150 is the pick.' },
    { pick_id: '2', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Kayshon Boutte Over 38.5 yards -115', source_type: 'discord_manual', teaser_source: '- Cowboys and Giants are 6-2 ATS in the last 8 games against the Rams.' },
    { pick_id: '3', operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Old exact pick -110' },
    { pick_id: '4', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#expert-picks', sport: 'football', selection: 'Not a writeup' }
  ], '2026-09-20');
  const text = JSON.stringify(payload);
  assert.equal(payload.length, 2);
  assert.equal(payload.every((card) => card.embeds.length === 1), true);
  assert.match(text, /Over 4\.5 receptions/);
  assert.match(text, /Over 38\.5 yards/);
  assert.doesNotMatch(text, /Recent production|Matchup context|Full breakdown/);
  assert.deepEqual(publicPreviews([{ pick_id: '1', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Bijan Robinson Over 4.5 receptions', teaser_source: 'Higbee had 2 catches against the Giants in Week 1.' }], '2026-09-20'), [{ number: 1, emoji: '🏈', sport: 'football', topics: ['Recent production'], prop: '||VIP PICK|| · Over 4.5 receptions', breakdown: '' }]);
  assert.doesNotMatch(text, /Bijan|Boutte|Higbee|Blake|Corum|Giants|Cowboys|Rams|43\.9|6-2|-150|-115|Old exact|Not a writeup/);
});

test('keeps a split market visible while redacting the paid player and price', () => {
  const previews = publicPreviews([{
    pick_id: 'payton', operating_date: '2026-09-22', status: 'PUBLISHED',
    destination: '#mlb-writeups', sport: 'baseball',
    selection: 'Payton Tolle over', published_line: '14.5 outs', published_odds_american: '-125',
    teaser_source: 'Over in 4/4 recent games. Over in 2/2 against CLE. Averaging 64 this season. CLE is 27th in OPS away.'
  }], '2026-09-22');
  assert.deepEqual(previews, [{
    number: 1, emoji: '⚾', sport: 'baseball',
    topics: ['Recent production', 'Matchup context'],
    prop: '||VIP PICK|| · over 14.5 outs',
    breakdown: 'Hit in 4/4 recent games · Hit in 2/2 the stated matchup sample.'
  }]);
  assert.doesNotMatch(JSON.stringify(previews), /Payton|Tolle|-125|CLE|27th|OPS|64/);

  const alreadyCombined = publicPreviews([{
    pick_id: 'combined', operating_date: '2026-09-22', status: 'PUBLISHED',
    destination: '#mlb-writeups', sport: 'baseball',
    selection: 'Payton Tolle over 14.5 outs', published_line: '14.5 outs',
    published_odds_american: '-125', teaser_source: 'Over in L10.'
  }], '2026-09-22');
  assert.equal(alreadyCombined[0].prop, '||VIP PICK|| · over 14.5 outs');
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
    const sent = [];
    const channel = { client: { user: { id: 'bot' } }, messages: { fetch: async () => new Map([['100', old], ['200', current], ...sent.map((m) => [m.id, m])].filter(([id]) => !deleted.includes(id))) }, send: async (payload) => { const m = { ...board(String(300 + sent.length)), embeds: payload.embeds }; sent.push(m); return m; } };
    const service = createFreeWriteupBoard({ channelFor: async () => channel, rowsFor: async () => [{ pick_id: 'pick', operating_date: '2026-09-21', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', teaser_source: '10 targets in recent games' }], stateFile: path.join(directory, 'state.json'), operatingDate: () => '2026-09-21' });
    const receipt = await service.refresh();
    assert.equal(receipt.status, 'UPDATED');
    assert.deepEqual(deleted, ['100', '200']);
    assert.equal(sent.length, 1);
    assert.equal(edited.length, 0);
    const quietReceipt = await service.refresh();
    assert.equal(quietReceipt.status, 'UNCHANGED');
    assert.equal(sent.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
