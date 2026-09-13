const test = require('node:test');
const assert = require('node:assert/strict');
const commands = require('./commands');

test('registers the private pick-audit lookup command', () => {
  const command = commands.find((item) => item.name === 'pick-audit');
  assert.ok(command);
  assert.equal(command.options[0].name, 'identifier');
  assert.equal(command.options[0].required, true);
});
