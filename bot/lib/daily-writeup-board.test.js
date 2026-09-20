const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyWriteupBoardPayload } = require('./daily-writeup-board');

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
