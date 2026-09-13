const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachDiscordRestAudit, endpointClass, inferredService, requestBodyHash } = require('./api-client');

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

test('records Discord failures that happen before a response without retaining route tokens, bodies, or error messages', async () => {
  const rest = new EventEmitter();
  rest.queueRequest = async () => {
    throw new TypeError('network refused request with private-token-in-error');
  };
  const events = [];
  const originalQueueRequest = rest.queueRequest;
  const audit = attachDiscordRestAudit(rest, {
    callerComponent: 'bot/test',
    triggerType: 'test'
  }, {
    recordImpl: async (event) => events.push(event)
  });

  await assert.rejects(() => rest.queueRequest({
    method: 'POST',
    fullRoute: '/interactions/123456789/private-interaction-token/callback',
    body: { content: 'private member response' }
  }), /private-token-in-error/);
  await audit.flush();
  audit.detach();

  assert.equal(events.length, 1);
  assert.equal(events[0].endpointClass, '/interactions/{id}/{token}/callback');
  assert.equal(events[0].method, 'POST');
  assert.equal(events[0].responseStatus, null);
  assert.equal(events[0].responsePayloadSha256, null);
  assert.equal(events[0].outcome, 'NETWORK_ERROR');
  assert.equal(events[0].errorClass, 'NETWORK_ERROR');
  assert.equal(events[0].requestPayloadSha256.length, 64);
  assert.ok(Number.isInteger(events[0].latencyMs) && events[0].latencyMs >= 0);
  assert.equal(JSON.stringify(events[0]).includes('123456789'), false);
  assert.equal(JSON.stringify(events[0]).includes('private-interaction-token'), false);
  assert.equal(JSON.stringify(events[0]).includes('private member response'), false);
  assert.equal(JSON.stringify(events[0]).includes('private-token-in-error'), false);
  assert.equal(rest.queueRequest, originalQueueRequest);
});

test('does not double-record an HTTP error already captured by the Discord response event', async () => {
  const rest = new EventEmitter();
  rest.queueRequest = async (request) => {
    rest.emit('response', {
      method: request.method,
      route: request.fullRoute,
      data: { body: request.body },
      retries: 0
    }, new Response('{"message":"private Discord error"}', {
      status: 503,
      headers: { 'content-type': 'application/json' }
    }));
    const error = new Error('private Discord error');
    error.status = 503;
    throw error;
  };
  const events = [];
  const audit = attachDiscordRestAudit(rest, {}, { recordImpl: async (event) => events.push(event) });

  await assert.rejects(() => rest.queueRequest({ method: 'POST', fullRoute: '/channels/123456789/messages', body: { content: 'private' } }));
  await audit.flush();
  audit.detach();

  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, 'HTTP_ERROR');
  assert.equal(events[0].responseStatus, 503);
  assert.equal(JSON.stringify(events[0]).includes('private Discord error'), false);
});
