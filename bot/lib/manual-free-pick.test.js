const test = require('node:test');
const assert = require('node:assert/strict');
const { manualFreePickRecord } = require('./manual-free-pick');

const content = `CeeDee Lamb O5.5 Receptions (-124):
Cowboys vs. Commanders

* Lamb finished Week 1 with 5 receptions on 8 targets
* Led Dallas with a 23.5% target share and 32% first-read target share`;

test('turns an authorized manual Free Pick into one canonical delivery packet', () => {
  const result = manualFreePickRecord({ id: '123', channelId: 'free', content, createdAt: new Date('2026-09-20T16:25:00Z'), author: { id: 'kobe', bot: false } }, {
    operatingDate: () => '2026-09-20', guildId: 'guild', channelId: 'free', approverIds: new Set(['kobe'])
  });
  assert.equal(result.row.pick_id, 'discord-manual-free-123');
  assert.equal(result.row.selection, 'CeeDee Lamb OVER 5.5 Receptions');
  assert.equal(result.row.published_line, '5.5');
  assert.equal(result.row.published_odds_american, '-124');
  assert.equal(result.packet.analysis.extraction.source_claims.length, 2);
  assert.equal(result.row.post_reference, 'https://discord.com/channels/guild/free/123');
});

test('rejects bots, unauthorized authors, wrong channels, thin posts and missing odds', () => {
  const options = { operatingDate: () => '2026-09-20', guildId: 'guild', channelId: 'free', approverIds: new Set(['kobe']) };
  const base = { id: '123', channelId: 'free', content, createdAt: new Date(), author: { id: 'kobe', bot: false } };
  assert.equal(manualFreePickRecord({ ...base, author: { id: 'bot', bot: true } }, options), null);
  assert.equal(manualFreePickRecord({ ...base, author: { id: 'other', bot: false } }, options), null);
  assert.equal(manualFreePickRecord({ ...base, channelId: 'paid' }, options), null);
  assert.equal(manualFreePickRecord({ ...base, content: 'CeeDee Lamb O5.5 Receptions\nCowboys vs. Commanders\n• one fact' }, options), null);
});
