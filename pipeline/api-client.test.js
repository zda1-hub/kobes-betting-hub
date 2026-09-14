const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachDiscordRestAudit, auditedFetch, endpointClass, inferredService, recordDiscordPreResponseFailure, requestBodyHash } = require('./api-client');

test('classifies operational API providers without retaining query strings', () => {
  assert.equal(inferredService('https://api.x.com/2/users/123456789/tweets?max_results=20'), 'x');
  assert.equal(inferredService('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'), 'espn');
  assert.equal(endpointClass('https://api.x.com/2/users/123456789/tweets?max_results=20'), '/2/users/{id}/tweets');
  assert.equal(endpointClass('/channels/:id/messages/:id'), '/channels/{id}/messages/{id}');
  assert.equal(endpointClass('/webhooks/123456789/sensitive-token/messages/987654321'), '/webhooks/{id}/{token}/messages/{id}');
});

test('hashes request bodies without storing their contents', () => {
  assert.equal(requestBodyHash('{"secret":"a"}').length, 64);
  assert.notEqual(requestBodyHash('{"secret":"a"}'), requestBodyHash('{"secret":"b"}'));
  assert.equal(requestBodyHash({ content: 'member-only copy' }).length, 64);
  assert.equal(requestBodyHash(undefined), null);
});

test('records Discord SDK REST responses without retaining route identifiers or payloads', async () => {
  const rest = new EventEmitter();
  const events = [];
  const audit = attachDiscordRestAudit(rest, {
    callerComponent: 'bot/test',
    triggerType: 'test'
  }, {
    recordImpl: async (event) => events.push(event)
  });

  rest.emit('response', {
    method: 'post',
    route: '/channels/123456789/messages',
    retries: 1,
    data: { body: { content: 'secret member message' } }
  }, new Response('{"id":"987654321"}', {
    status: 201,
    headers: { 'content-type': 'application/json', 'x-request-id': 'trace-123' }
  }));
  await audit.flush();
  audit.detach();

  assert.equal(events.length, 1);
  assert.equal(events[0].service, 'discord');
  assert.equal(events[0].endpointClass, '/channels/{id}/messages');
  assert.equal(events[0].method, 'POST');
  assert.equal(events[0].responseStatus, 201);
  assert.equal(events[0].outcome, 'SUCCEEDED');
  assert.equal(events[0].retryCount, 1);
  assert.equal(events[0].providerRequestId, 'trace-123');
  assert.equal(events[0].requestPayloadSha256.length, 64);
  assert.equal(events[0].responsePayloadSha256.length, 64);
  assert.equal(JSON.stringify(events[0]).includes('secret member message'), false);
  assert.equal(JSON.stringify(events[0]).includes('123456789'), false);
});

test('does not misclassify or retry a failed audit write after a successful provider response', async () => {
  let auditAttempts = 0;
  await assert.rejects(() => auditedFetch(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    {},
    { service: 'espn' },
    async () => new Response('{"events":[]}', { status: 200, headers: { 'content-type': 'application/json' } }),
    async () => {
      auditAttempts += 1;
      throw new Error('audit unavailable');
    }
  ), /audit unavailable/);
  assert.equal(auditAttempts, 1);
});

test('records a provider network failure exactly once', async () => {
  const events = [];
  await assert.rejects(() => auditedFetch(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    {},
    { service: 'espn' },
    async () => { throw new TypeError('network unavailable'); },
    async (event) => events.push(event)
  ), /network unavailable/);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, 'NETWORK_ERROR');
  assert.equal(events[0].errorClass, 'TypeError');
});

test('records Discord failures that happen before the SDK emits a response event', async () => {
  const events = [];
  await recordDiscordPreResponseFailure({
    endpointClass: '/interactions/{id}/{token}',
    callerComponent: 'bot/index',
    triggerType: 'approval_failure_receipt',
    pickId: '20260913-NFL-001'
  }, Object.assign(new TypeError('network unavailable'), { code: 'UND_ERR_CONNECT_TIMEOUT' }), async (event) => events.push(event));
  assert.equal(events.length, 1);
  assert.equal(events[0].service, 'discord');
  assert.equal(events[0].outcome, 'NETWORK_ERROR');
  assert.equal(events[0].errorClass, 'UND_ERR_CONNECT_TIMEOUT');
  assert.equal(events[0].pickId, '20260913-NFL-001');
  assert.doesNotMatch(JSON.stringify(events[0]), /network unavailable/);
});
