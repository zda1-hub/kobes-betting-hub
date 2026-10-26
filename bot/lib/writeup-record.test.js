const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicResults } = require('./public-results');
const { writeupChannelIds } = require('./writeup-record');
const row = (id, result, channel = '20', extra = {}) => ({ pick_id: id, operating_date: '2026-10-24',
  published_at: '2026-10-24T12:00:00Z', status: 'PUBLISHED', post_reference: `https://discord.com/channels/1/${channel}/${id}`,
  source_name: 'Source', selection: 'Pick ' + id, wager_scope: 'individual', result,
  result_verified_source: 'https://www.espn.com/game/1', result_verified_at: '2026-10-25T03:00:00Z', ...extra });
const build = rows => buildPublicResults(rows, '2026-10-25', new Date('2026-10-25T18:00:00Z'), { expertChannelIds: ['10'], writeupChannelIds: ['20'] }).writeupRecord;

test('writeup record uses full scoped ledger and counts wins/losses with unresolved separate', () => {
  const rows = [row('1','W'),row('2','L'),row('3','P'),row('4','V'),row('5','W','10'),row('6','W','20',{result_verified_at:''}),row('7','W','20',{published_at:''})];
  assert.deepEqual(build(rows), { scope:'writeup_channels', wins:1,losses:1,pushes:1,voids:1,pending:1,trackingSince:'2026-10-24',through:'2026-10-25' });
  assert.equal(build(Array.from({length:70},(_,i)=>row(String(i),'W'))).wins,70);
});
test('duplicates count once, conflicting grades remain unresolved and provenance survives', () => {
  assert.equal(build([row('1','W'),row('2','W','20',{selection:'Pick 1'})]).wins,1);
  assert.equal(build([row('1','W'),row('2','W','20',{selection:'Pick 1',source_name:'Other credit'})]).wins,1);
  const conflict=build([row('1','W'),row('2','L','20',{selection:'Pick 1'})]);
  assert.equal(conflict.wins,0);assert.equal(conflict.pending,1);
  assert.equal(build([row('1','W','10',{publication_channel_ids:['10','20']})]).wins,1);
});
test('missing scope stays unavailable and explicit scope never admits expert/free/hockey channels', () => {
  assert.equal(buildPublicResults([row('1','W')],'2026-10-25').writeupRecord,null);
  assert.deepEqual(writeupChannelIds({PUBLIC_WRITEUP_CHANNEL_IDS:'20,10,30,40,20',EXPERT_PICKS_CHANNEL_ID:'10',FREE_PICK_CHANNEL_ID:'30',HOCKEY_PICK_CHANNEL_ID:'40'}),['20']);
  assert.deepEqual(writeupChannelIds({DAILY_WRITEUPS_CHANNEL_ID:'20',SPORT_CHANNEL_MAP:'football:21,baseball:22'}),['20','21','22']);
});
