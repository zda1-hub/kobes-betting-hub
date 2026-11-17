'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFINITION_VERSION, currentSnapshot } = require('./rank-snapshot');

test('Tuesday ranks rebuild Monday and older-definition sheets once, then reuse Tuesday sheet', () => {
  const tuesday = new Date('2026-11-17T18:45:00Z');
  assert.equal(currentSnapshot({ updatedAt: '2026-11-16T23:24:59Z' }, tuesday), false);
  assert.equal(currentSnapshot({ definitionVersion: DEFINITION_VERSION,
    updatedAt: '2026-11-16T23:24:59Z' }, tuesday), false);
  assert.equal(currentSnapshot({ definitionVersion: DEFINITION_VERSION - 1,
    updatedAt: '2026-11-17T18:30:00Z' }, tuesday), false);
  assert.equal(currentSnapshot({ definitionVersion: DEFINITION_VERSION,
    updatedAt: '2026-11-17T18:30:00Z' }, tuesday), true);
});
