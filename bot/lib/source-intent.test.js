const test = require('node:test');
const assert = require('node:assert/strict');
const { isRetrospectivePropsList } = require('./source-intent');

test('a season-long hit list is research rather than an actionable pick', () => {
  assert.equal(isRetrospectivePropsList('There are 52 NFL props that have cashed in every single game this season.\nAaron Rodgers 175+ Passing Yards'), true);
  assert.equal(isRetrospectivePropsList('Here are props that hit in every game this season.'), true);
  assert.equal(isRetrospectivePropsList('My pick today: Aaron Rodgers 175+ Passing Yards'), false);
});
