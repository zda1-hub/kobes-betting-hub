const test = require('node:test');
const assert = require('node:assert/strict');
const { endpointClass, inferredService, requestBodyHash } = require('./api-client');

test('classifies operational API providers without retaining query strings', () => {
  assert.equal(inferredService('https://api.x.com/2/users/123456789/tweets?max_results=20'), 'x');
  assert.equal(inferredService('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'), 'espn');
  assert.equal(endpointClass('https://api.x.com/2/users/123456789/tweets?max_results=20'), '/2/users/{id}/tweets');
});

test('hashes request bodies without storing their contents', () => {
  assert.equal(requestBodyHash('{"secret":"a"}').length, 64);
  assert.notEqual(requestBodyHash('{"secret":"a"}'), requestBodyHash('{"secret":"b"}'));
  assert.equal(requestBodyHash(undefined), null);
});
