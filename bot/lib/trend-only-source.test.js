const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrendOnlySource } = require('./trend-only-source');

test('holds an existing TrendsCenter packet even when its saved source mode is stale', () => {
  assert.equal(isTrendOnlySource({ source: { handle: 'trendscenterapp', monitoring_mode: 'writeup_or_trend' } }), true);
  assert.equal(isTrendOnlySource({ source: { handle: 'BettingBuddyy', publish_mode: 'terms_only' } }), false);
});
