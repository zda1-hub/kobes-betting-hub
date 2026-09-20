const test = require('node:test');
const assert = require('node:assert/strict');
const { freeWriteupBoardPayload } = require('./free-writeup-board');

test('previews every current writeup without exposing exact wagers', () => {
  const payload = freeWriteupBoardPayload([
    { pick_id: '1', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Bijan Robinson', published_line: 'Over 4.5 receptions', published_odds_american: '-150' },
    { pick_id: '2', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Kayshon Boutte Over 38.5 yards -115', source_type: 'discord_manual' },
    { pick_id: '3', operating_date: '2026-09-19', status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', selection: 'Old exact pick -110' },
    { pick_id: '4', operating_date: '2026-09-20', status: 'PUBLISHED', destination: '#expert-picks', sport: 'football', selection: 'Not a writeup' }
  ], '2026-09-20');
  const text = payload.embeds[0].description;
  assert.match(text, /2 new writeups/);
  assert.match(text, /PLAY 1[\s\S]*PLAY 2/);
  assert.match(text, /Kobe’s manual breakdown/);
  assert.doesNotMatch(text, /Bijan|Boutte|4\.5|38\.5|-150|-115|Old exact|Not a writeup/);
});

test('stays empty until a writeup is published', () => {
  assert.equal(freeWriteupBoardPayload([], '2026-09-20'), null);
});
