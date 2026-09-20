const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyWriteupBoardPayload, manualFootballWriteupRow, nflArchivePayloads } = require('./daily-writeup-board');

test('groups only current published writeups by sport and preserves exact terms', () => {
  const payload = dailyWriteupBoardPayload([
    { operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Joe Runner', published_line: 'Over 72.5 yards', published_odds_american: '-115' },
    { operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#mlb-writeups', league: 'MLB', selection: 'Yankees', published_line: 'ML', published_odds_american: '+105' },
    { operating_date: '2026-09-18', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Old pick' },
    { operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#expert-picks', sport: 'football', selection: 'Exclusive' }
  ], '2026-09-19');
  assert.match(payload.embeds[0].description, /FOOTBALL[\s\S]*Joe Runner Over 72\.5 yards -115/);
  assert.match(payload.embeds[0].description, /BASEBALL[\s\S]*Yankees ML \+105/);
  assert.doesNotMatch(payload.embeds[0].description, /Old pick|Exclusive/);
});

test('does not repeat a line already present in the selection', () => {
  const payload = dailyWriteupBoardPayload([
    { operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Kamario Taylor Over 50.5 Rushing Yards', published_line: 'Over 50.5 rushing yards', published_odds_american: '-110' }
  ], '2026-09-19');
  assert.match(payload.embeds[0].description, /Kamario Taylor Over 50\.5 Rushing Yards -110/);
  assert.doesNotMatch(payload.embeds[0].description, /Rushing Yards Over 50\.5/i);
});

test('returns no board before the first writeup of the day', () => {
  assert.equal(dailyWriteupBoardPayload([], '2026-09-19'), null);
});

test('indexes Kobe manual football writeups while rejecting chat and bot messages', () => {
  const dateFor = () => '2026-09-20';
  const row = manualFootballWriteupRow({
    id: '1551', createdAt: new Date('2026-09-20T16:10:00Z'), author: { bot: false },
    content: 'Bijan Robinson O4.5 Receptions (-150 FD):\nFalcons vs. Panthers\n\n• supporting fact',
  }, dateFor);
  assert.equal(row.selection, 'Bijan Robinson O4.5 Receptions (-150 FD)');
  assert.equal(row.league, 'NFL');
  assert.equal(manualFootballWriteupRow({ id: '2', author: { bot: false }, content: 'Good luck today' }, dateFor), null);
  assert.equal(manualFootballWriteupRow({ id: '3', author: { bot: true }, content: 'Player Over 4.5 Receptions (-110)' }, dateFor), null);
});

test('indexes split-line and unparenthesized manual NFL pick formats', () => {
  const dateFor = () => '2026-09-19';
  const split = manualFootballWriteupRow({
    id: '4', author: { bot: false }, createdAt: new Date(),
    content: 'Kayshon Boutte\nOver 38.5 Receiving Yards -115\n\n• matchup note',
  }, dateFor);
  assert.equal(split.selection, 'Kayshon Boutte Over 38.5 Receiving Yards -115');
  const unicode = manualFootballWriteupRow({
    id: '5', author: { bot: false }, createdAt: new Date(),
    content: 'Stefon Diggs O5.5 Receptions (−110 FD):\nBills matchup',
  }, dateFor);
  assert.equal(unicode.selection, 'Stefon Diggs O5.5 Receptions (-110 FD)');
});

test('builds a deduplicated previous-day NFL archive and excludes college football', () => {
  const rows = [
    { operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', league: 'NFL', selection: 'David Montgomery', published_line: 'Over 15.5 rushing attempts', published_odds_american: '-110' },
    { operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', league: 'NFL', selection: 'David Montgomery Over 15.5 rushing attempts (-110)' },
    { operating_date: '2026-09-18', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', league: 'NCAAF', selection: 'College Pick -110' },
    { operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', league: 'NFL', selection: 'Today Pick -110' },
  ];
  const payloads = nflArchivePayloads(rows, '2026-09-20');
  assert.equal(payloads.length, 1);
  assert.match(payloads[0].embeds[0].description, /2026-09-19[\s\S]*David Montgomery/);
  assert.equal((payloads[0].embeds[0].description.match(/David Montgomery/g) || []).length, 1);
  assert.doesNotMatch(payloads[0].embeds[0].description, /College Pick|Today Pick/);
});
