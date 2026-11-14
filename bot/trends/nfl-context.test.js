const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReleaseTimestamp, playerContext, formatContext } = require('./nfl-context');

const roster = 'season,team,position,status,full_name,gsis_id,week\n' +
  '2097,BUF,QB,ACT,Sample Player,p1,10\n' +
  '2097,BUF,QB,RES,Other,p2,10\n';
const injury = 'season,team,week,gsis_id,report_status,report_primary_injury,practice_status\n' +
  '2097,BUF,10,p1,Questionable,Shoulder,Limited Participation\n';
const timestamp = JSON.stringify({ last_updated: '2097-11-14 09:00:00 EST' });
const fetchImpl = async url => ({ ok: true, text: async () =>
  url.includes('timestamp.json') ? timestamp : url.includes('/rosters/') ? roster : injury });

test('nflverse release timestamps have explicit Eastern offsets', () => {
  assert.equal(parseReleaseTimestamp(timestamp), '2097-11-14T14:00:00.000Z');
  assert.equal(parseReleaseTimestamp('{"last_updated":"2097-07-14 09:00:00 EDT"}'), '2097-07-14T13:00:00.000Z');
  assert.throws(() => parseReleaseTimestamp('{"last_updated":"yesterday"}'), /Unrecognized/);
});

test('fresh roster and same-week injury report are attributed without assuming game-day availability', async () => {
  const result = await playerContext({ season: 2097, playerId: 'p1', fetchImpl,
    now: Date.parse('2097-11-14T15:00:00Z') });
  assert.equal(result.rosterFresh, true);
  assert.equal(result.roster.status, 'ACT');
  assert.equal(result.injury.reportStatus, 'Questionable');
  assert.match(formatContext(result), /Questionable/);
  assert.match(formatContext(result), /practice: Limited Participation/);
});

test('a stale feed or missing injury row never implies an available player', async () => {
  const stale = await playerContext({ season: 2097, playerId: 'p1', fetchImpl,
    now: Date.parse('2097-11-17T00:00:00Z') });
  assert.match(formatContext(stale), /Roster: not current/);
  assert.match(formatContext(stale), /Injury report: current player status not confirmed/);
  const missing = await playerContext({ season: 2097, playerId: 'p2', fetchImpl,
    now: Date.parse('2097-11-14T15:00:00Z') });
  assert.match(formatContext(missing), /Injury report: current player status not confirmed/);
});
