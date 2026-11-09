const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const { renderFreePickChatCard } = require('./free-pick-chat-card');
const { renderInstagramStory } = require('./instagram-story');

const run = promisify(execFile);
const MAX_REEL_BYTES = 20 * 1024 * 1024;

async function renderFreePickReel(packet, { cardRenderer = renderFreePickChatCard, fallbackRenderer = renderInstagramStory, ffmpegPath = ffmpeg.path } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-free-pick-reel-'));
  try {
    const image = path.join(directory, 'card.jpg');
    const output = path.join(directory, 'reel.mp4');
    let card;
    try { card = await cardRenderer(packet); }
    catch { card = await fallbackRenderer(packet); }
    await fs.writeFile(image, card);
    await run(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '24', '-i', image,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-t', '8', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p',
      '-r', '24', '-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-shortest',
      '-movflags', '+faststart', output,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const video = await fs.readFile(output);
    if (!video.length || video.length > MAX_REEL_BYTES) throw new Error('Free Pick Reel exceeds the media upload limit.');
    return video;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { renderFreePickReel, MAX_REEL_BYTES };
