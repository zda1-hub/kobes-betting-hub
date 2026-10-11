const test = require('node:test');
const assert = require('node:assert/strict');
const commands = require('../commands');
const { buildPickEmbed } = require('./pick');
test('manual publish and preview accept optional uncapped source odds', () => {
  for (const name of ['publish-pick', 'preview-pick']) {
    const command = commands.find(item => item.name === name);
    assert.ok(command, name);
    const odds = command.options.find(item => item.name === 'published_odds');
    assert.equal(odds.required, false);
    assert.equal(odds.min_value, undefined);
    assert.equal(odds.max_value, undefined);
    let optional = false;
    for (const option of command.options) {
      if (!option.required) optional = true;
      else assert.equal(optional, false, 'required options must precede optional options');
    }
  }
});
test('pick rendering preserves any supplied source price or an unpriced pick', () => {
  for (const price of ['-309', '+950', '+25000', '-25000', '']) {
    const pick = 'Test Team ML ' + price;
    const embed = buildPickEmbed({ pick, evidence: 'one; two; three; four', confidence: 7, imageUrl: 'https://example.com/pick.png' });
    assert.equal(embed.title, pick);
  }
});
