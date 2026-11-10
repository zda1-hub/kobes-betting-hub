const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { renderFreePickReel } = require('./free-pick-reel');
const run = promisify(execFile);

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

test('Reel visibly fades in and out around its readable middle', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-fade-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const card = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const video = await renderFreePickReel({ pick_id: 'fade-test' }, { cardRenderer: async () => card });
  const file = path.join(dir, 'reel.mp4');
  await fs.writeFile(file, video);
  async function brightness(seconds) {
    const { stdout } = await run(ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-ss', String(seconds),
      '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
    return (await sharp(stdout).stats()).channels[0].mean;
  }
  const [opening, middle, ending] = await Promise.all([brightness(0), brightness(3), brightness(5.8)]);
  assert.ok(opening < 75, `opening brightness was ${opening}`);
  assert.ok(middle > 225, `middle brightness was ${middle}`);
  assert.ok(ending < 160, `ending brightness was ${ending}`);
});
