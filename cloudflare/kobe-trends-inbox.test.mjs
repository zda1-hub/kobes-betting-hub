import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('./kobe-trends-inbox.gs', import.meta.url), 'utf8');

function loadHelper(fetchImpl, errors = []) {
  const context = {
    PUBLISHER_URL: 'https://publisher.test',
    UrlFetchApp: { fetch: fetchImpl },
    Utilities: { getUuid: () => '123e4567-e89b-12d3-a456-426614174000' },
    console: { error: (value) => errors.push(String(value)) },
  };
  vm.runInNewContext(`${source}\nglobalThis.__test = { auditedPublisherFetch_ };`, context);
  return context.__test.auditedPublisherFetch_;
}

test('every Apps Script Publisher request uses the audit marker helper', () => {
  assert.equal((source.match(/auditedPublisherFetch_\('/g) || []).length, 3);
  assert.equal((source.match(/UrlFetchApp\.fetch\(/g) || []).length, 1);
  assert.equal(/failed[^\n]+getContentText\(\)/.test(source), false);
});

test('Apps Script audit markers preserve queue authorization without exposing it', () => {
  const calls = [];
  const expectedResponse = { getResponseCode: () => 200 };
  const auditedPublisherFetch = loadHelper((url, options) => {
    calls.push({ url, options });
    return expectedResponse;
  });
  const options = {
    method: 'post',
    headers: { Authorization: 'Bearer private-queue-secret' },
    payload: 'private request body',
  };

  const response = auditedPublisherFetch('/api/queue/trends', options);

  assert.equal(response, expectedResponse);
  assert.equal(calls[0].url, 'https://publisher.test/api/queue/trends');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer private-queue-secret');
  assert.equal(calls[0].options.headers['X-KBH-Caller'], 'gmail-apps-script');
  assert.equal(calls[0].options.headers['X-KBH-Client-Request-Id'], '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(options.headers['X-KBH-Caller'], undefined);
});

test('Apps Script pre-response logging excludes credentials, bodies, and error messages', () => {
  const errors = [];
  const auditedPublisherFetch = loadHelper(() => {
    throw new TypeError('private-queue-secret private request body');
  }, errors);

  assert.throws(() => auditedPublisherFetch('/api/queue/trends', {
    method: 'post',
    headers: { Authorization: 'Bearer private-queue-secret' },
    payload: 'private request body',
  }), /private-queue-secret/);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].includes('private-queue-secret'), false);
  assert.equal(errors[0].includes('private request body'), false);
  assert.equal(errors[0].includes('publisher_request_no_response'), true);
  assert.equal(errors[0].includes('/api/queue/trends'), true);
  assert.equal(errors[0].includes('TypeError'), true);
});
