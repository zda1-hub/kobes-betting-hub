const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createFreeWriteupBoard, freeWriteupBoardPayload, freeWriteupTableSvg, publicPreviews } = require('./free-writeup-board');

test('renders current writeups as one table with visible prop lines and hidden identities', async () => {
  const rows = [
    { pick_id: '1', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Bijan Robinson', published_line: 'Over 4.5 receptions', published_odds_american: '-150', teaser_source: '- Higbee had 2 catches against the Giants in Week 1.\n- Blake Corum averaged 43.9 rushing yards for the Rams.\n- Over 4.5 receptions at -150 is the pick.' },
    { pick_id: '2', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Kayshon Boutte Over 38.5 yards -115', source_type: 'discord_manual', teaser_source: '- Cowboys and Giants are 6-2 ATS in the last 8 games against the Rams.' },
    { pick_id: '3', operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Old exact pick -110' },
    { pick_id: '4', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#expert-picks', sport: 'football', selection: 'Not a writeup' }
  ];
  const payload = await freeWriteupBoardPayload(rows, '2026-09-20');
  const text = freeWriteupTableSvg(publicPreviews(rows, '2026-09-20'));
  assert.equal(payload.length, 1);
  assert.equal(payload[0].embeds.length, 1);
  assert.equal(payload[0].embeds[0].fields, undefined);
  assert.equal(payload[0].files[0].name, 'writeups-2026-09-20-1.png');
  const metadata = await require('sharp')(payload[0].files[0].attachment).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 2000);
  assert.match(text, /Player or Game prop/);
  assert.match(text, /Short breakdown, full breakdown in channel/);
  assert.match(text, /Over 4\.5 receptions/);
  assert.match(text, /Over 38\.5 yards/);
  assert.match(text, /x1="710"/);
  assert.doesNotMatch(text, /Bijan|Boutte|Higbee|Blake|Corum|Giants|Cowboys|Rams|43\.9|6-2|-150|-115|Old exact|Not a writeup/);
});

test('keeps split-market lines visible while hiding identities and odds', () => {
  const previews = publicPreviews([{
    pick_id: 'payton', operating_date: '2026-09-22', status: 'PUBLISHED',
    destination: '#mlb-writeups', sport: 'baseball',
    selection: 'Payton Tolle over', published_line: '14.5 outs', published_odds_american: '-125',
    teaser_source: 'Tolle went over in 4/4 recent games. Tolle went over in 2/2 against CLE. Averaging 64 this season. CLE is 27th in OPS away.'
  }], '2026-09-22');
  assert.deepEqual(previews, [{
    number: 1, emoji: '⚾', sport: 'baseball',
    topics: ['Recent production', 'Matchup context'],
    stats: ['4/4 in recent games', '2/2 in the stated matchup sample'],
    prop: 'Over 14.5 outs',
    breakdown: '4/4 in recent games; 2/2 in the stated matchup sample.'
  }]);
  assert.doesNotMatch(JSON.stringify(previews), /Payton|Tolle|-125|CLE|27th|OPS|64/);

  const unrelated = publicPreviews([{
    pick_id: 'unrelated', operating_date: '2026-09-22', status: 'PUBLISHED',
    destination: '#mlb-writeups', sport: 'baseball', selection: 'Payton Tolle over',
    teaser_source: 'Another player hit in 4/4 recent games. Tolle has a matchup note.'
  }], '2026-09-22');
  assert.doesNotMatch(unrelated[0].breakdown, /4\/4/);

  const alreadyCombined = publicPreviews([{
    pick_id: 'combined', operating_date: '2026-09-22', status: 'PUBLISHED',
    destination: '#mlb-writeups', sport: 'baseball',
    selection: 'Payton Tolle over 14.5 outs', published_line: '14.5 outs',
    published_odds_american: '-125', teaser_source: 'Over in L10.'
  }], '2026-09-22');
  assert.equal(alreadyCombined[0].prop, 'Over 14.5 outs');
});

test('shows concrete source-backed notes without revealing the selected play', () => {
  const preview = publicPreviews([{
    pick_id: 'x', operating_date: '2026-09-26', status: 'PUBLISHED', destination: '#football-writeups',
    sport: 'football', selection: 'Tetairoa McMillan', published_line: 'Over 60 yards',
    teaser_source: 'McMillan recorded 75 & 101 yards in Weeks 1 & 2. McMillan has 14 targets through two games. Carolina plays Arizona.'
  }], '2026-09-26')[0];
  assert.match(preview.breakdown, /Recent yardage outputs: 75 and 101/);
  assert.match(preview.breakdown, /14 targets/);
  assert.doesNotMatch(JSON.stringify(preview), /Tetairoa|McMillan|Carolina|Arizona/);
});

test('keeps decimals intact and rejects projections, other subjects, dates, and catch ratios', () => {
  const preview = (source) => publicPreviews([{
    pick_id: 'safe', operating_date: '2026-09-26', status: 'PUBLISHED',
    destination: '#football-writeups', sport: 'football', selection: 'Blake Corum',
    teaser_source: source
  }], '2026-09-26')[0].breakdown;
  assert.match(preview('Corum averaged 43.9 rushing yards per game this season.'), /43\.9 rushing yards per game/);
  assert.match(preview('Blake Corum hit in 4 of 5 recent games.'), /4\/5 in recent games/);
  for (const source of [
    'Compared with Corum, Williams had 14 targets in two games.',
    'Corum and Williams recorded 75 and 101 yards in two games.',
    'Corum is projected to average 43.9 rushing yards per game.',
    'Corum has not had 14 targets in two games.',
    'Corum caught 5 of 8 targets in his last game.',
    'Corum last played on 9/25/2026.',
    'Corum averaged 43.9 rushing yards per quarter.',
    'Corum missed; Williams had 14 targets in two games.'
  ]) assert.doesNotMatch(preview(source), /43\.9|14 targets|75|101|5 of 8|4\/5/, source);
});

test('handles the current approved bullet formats without copying player or team identities', () => {
  const row = (selection, teaser_source) => ({ pick_id: selection, selection, teaser_source,
    operating_date: '2026-09-26', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football' });
  const previews = publicPreviews([
    row('Harold Fannin Jr.', '- **Fannin** coming of a solid Week 2 where he hauled in 5 grabs on 6 targets against the Buccaneers'),
    row('Carnell Tate', '- Tate has not had his breakout week yet.\n- 11 targets in Weeks 1-2'),
    row('Under 48.5', '- no Alonza Barnett for UCF, starting a back up QB\n- they might go run heavy @ home')
  ], '2026-09-26');
  assert.match(previews[0].breakdown, /6 targets in the cited game/);
  assert.match(previews[1].breakdown, /11 targets across the cited weeks/);
  assert.match(previews[2].breakdown, /Backup quarterback noted in the matchup/);
  assert.match(previews[2].breakdown, /considers a run-heavy game plan/);
  assert.doesNotMatch(JSON.stringify(previews), /Fannin|Buccaneers|Tate|Barnett|UCF/);
});

test('turns the current football writeup formats into anonymous source-backed stats', () => {
  const row = (selection, published_line, teaser_source) => ({ pick_id: selection, selection, published_line, teaser_source,
    operating_date: '2026-10-01', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football' });
  const previews = publicPreviews([
    row('Denzel Boston', 'Over 37.5 receiving yards', '- Over in all 3 games this season, averaging 65 receiving yards per game\n- Facing a depleted Steelers secondary'),
    row('Darnell Washington', 'Over 14.5 receiving yards', '- He’s covered this line in 2/3 games to start the year\n- He’s coming off a 67-yard game with 3 receptions on 4 targets'),
    row('Harold Fannin Jr.', 'Over 4.5 receptions', '- Fannin has turned 15 targets into 12 catches, 125 yards and 2 touchdowns over his last two games')
  ], '2026-10-01');
  assert.deepEqual(previews.map(item => item.stats), [
    ['3/3 in recent games', '65 receiving yards per game in the cited sample'],
    ['2/3 in recent games', '67 receiving yards and 4 targets in the cited game'],
    ['15 targets and 12 catches across two cited games']
  ]);
  assert.doesNotMatch(JSON.stringify(previews), /Boston|Washington|Fannin|Steelers|Browns/);
});

test('stays empty until a writeup is published', async () => {
  assert.equal(await freeWriteupBoardPayload([], '2026-09-20'), null);
});

test('restart replaces legacy boards with one table and remains unchanged on refresh', async () => {
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


test('table escapes text and wraps rows instead of truncating source-backed notes', () => {
  const svg = freeWriteupTableSvg([{ prop: 'Over 64.5 receiving yards', breakdown: '4/4 in recent games; 2/2 in the stated matchup sample; 64 rushing yards per game in the cited sample. <script>&' }]);
  assert.match(svg, /&lt;script&gt;&amp;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /per game in the cited sample/);
});

test('changing a row refreshes its image while consolidating four old cards', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kbh-free-table-'));
  try {
    const deleted = [], edited = [];
    let source = 'Corum has 6 targets in two games.';
    const existing = Array.from({ length: 4 }, (_, i) => ({
      id: String(i + 1), author: { id: 'bot' },
      embeds: [{ footer: { text: `KBH free-writeups-v1 · 2026-09-26 · ${i + 1}` } }],
      delete: async () => deleted.push(String(i + 1)),
      edit: async (payload) => { edited.push(payload); return { id: String(i + 1) }; }
    }));
    const channel = { client: { user: { id: 'bot' } }, messages: { fetch: async () => new Map(existing.filter(m => !deleted.includes(m.id)).map(m => [m.id, m])) }, send: async () => { throw new Error('must update the existing first message'); } };
    const service = createFreeWriteupBoard({ channelFor: async () => channel, rowsFor: async () => [{ pick_id: 'p', operating_date: '2026-09-26', status: 'PUBLISHED', destination: '#football-writeups', selection: 'Blake Corum', published_line: 'Over 50.5 rush yards', teaser_source: source }], stateFile: path.join(directory, 'state.json'), operatingDate: () => '2026-09-26' });
    assert.equal((await service.refresh()).status, 'UPDATED');
    assert.deepEqual(deleted, ['2', '3', '4']); assert.equal(edited.length, 1);
    assert.equal((await service.refresh()).status, 'UNCHANGED');
    source = 'Corum has 8 targets in two games.';
    assert.equal((await service.refresh()).status, 'UPDATED');
    assert.equal(edited.length, 2);
    assert.notDeepEqual(edited[0].files[0].attachment, edited[1].files[0].attachment);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
