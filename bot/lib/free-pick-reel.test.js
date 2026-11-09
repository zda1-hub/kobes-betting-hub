const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { renderFreePickReel } = require('./free-pick-reel');

test('free-pick chat card becomes a bounded vertical MP4 Reel', async () => {
  const card = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#111111' } }).jpeg().toBuffer();
  const reel = await renderFreePickReel({ pick_id: 'approved-test' }, { cardRenderer: async () => card });
  assert.equal(reel.toString('ascii', 4, 8), 'ftyp');
  assert.ok(reel.length > 1000 && reel.length < 20 * 1024 * 1024);
});

test('approved Story text card covers picks the chat card cannot render', async () => {
  const card = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#f37021' } }).jpeg().toBuffer();
  const reel = await renderFreePickReel({ pick_id: 'team-pick' }, {
    cardRenderer: async () => { throw new Error('player prop card unavailable'); },
    fallbackRenderer: async () => card,
  });
  assert.equal(reel.toString('ascii', 4, 8), 'ftyp');
});
