const test = require('node:test');
const assert = require('node:assert/strict');
const { educationDrafts, educationReviewPayload, parseEducationButton } = require('./calendar-education-review');

test('only upcoming dated education drafts are prepared with exact artwork and copy', async () => {
  const drafts = await educationDrafts(Date.parse('2026-11-10T04:00:00Z'));
  assert.deepEqual(drafts.map(x => x.slot.id), [
    'cal-20261111-wed0900', 'cal-20261111-wed1430', 'cal-20261113-fri0900'
  ]);
  for (const draft of drafts) {
    assert.ok(draft.bytes.length > 1000);
    assert.match(draft.topic.xText, /https:\/\/discord\.gg\/sB9vzGz2xj/);
    assert.match(draft.marker, /^KBH calendar education cal-\d{8}-[a-z]{3}\d{4} [a-f0-9]{16}$/);
  }
  assert.equal((await educationDrafts(Date.parse('2026-11-14T04:00:00Z'))).length, 0);
});

test('review card contains exact copy and image with explicit schedule controls', async () => {
  const [draft] = await educationDrafts(Date.parse('2026-11-10T04:00:00Z'));
  const card = educationReviewPayload(draft);
  assert.equal(card.embeds[0].description, draft.topic.xText);
  assert.equal(card.embeds[0].footer.text, draft.marker);
  assert.equal(card.files[0].attachment, draft.bytes);
  assert.deepEqual(parseEducationButton(card.components[0].components[0].custom_id),
    { action: 'approve', id: draft.slot.id, digest: draft.digest });
  assert.equal(educationReviewPayload(draft, true).components[0].components[0].disabled, true);
  assert.equal(parseEducationButton('calendar-education:approve:wrong:0'), null);
});
