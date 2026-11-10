const test = require('node:test');
const assert = require('node:assert/strict');
const { editorialDrafts, editorialReviewPayload, parseEditorialButton } = require('./calendar-editorial-review');

test('editorial drafts use verified non-poll slots, exact images and direct Discord copy', async () => {
  const drafts = await editorialDrafts(Date.parse('2026-11-10T04:00:00Z'));
  assert.deepEqual(drafts.map(item => item.slot.id), [
    'cal-20261110-tue1500', 'cal-20261111-wed1800', 'cal-20261113-fri1500'
  ]);
  for (const draft of drafts) {
    assert.ok(draft.bytes.length > 1000);
    assert.match(draft.draft.xText, /https:\/\/discord\.gg\/sB9vzGz2xj/);
    assert.match(draft.marker, /^KBH calendar editorial cal-\d{8}-[a-z]{3}\d{4} [a-f0-9]{16}$/);
    const card = editorialReviewPayload(draft);
    assert.equal(card.embeds[0].description, draft.draft.xText);
    assert.equal(card.files[0].attachment, draft.bytes);
    assert.deepEqual(parseEditorialButton(card.components[0].components[0].custom_id),
      { action: 'approve', id: draft.slot.id, digest: draft.digest });
    assert.equal(editorialReviewPayload(draft, true).components[0].components[0].disabled, true);
  }
  assert.equal((await editorialDrafts(Date.parse('2026-11-14T04:00:00Z'))).length, 0);
  assert.equal(parseEditorialButton('calendar-editorial:approve:wrong:0'), null);
});
