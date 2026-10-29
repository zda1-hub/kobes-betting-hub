const test = require('node:test');
const assert = require('node:assert/strict');
const commands = require('./commands');

test('registers the private pick-audit lookup command', () => {
  const command = commands.find((item) => item.name === 'pick-audit');
  assert.ok(command);
  assert.equal(command.options[0].name, 'identifier');
  assert.equal(command.options[0].required, true);
});

test('registers a message action for editing published writeups', () => {
  const command = commands.find((item) => item.name === 'Edit writeup');
  assert.ok(command);
  assert.equal(command.type, 3);
});

test('registers a message action for sharing a writeup to free plays', () => {
  const command = commands.find((item) => item.name === 'Share to free plays');
  assert.ok(command);
  assert.equal(command.type, 3);
});
