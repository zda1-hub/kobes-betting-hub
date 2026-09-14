const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { STORY_HEIGHT, STORY_WIDTH, escapeXml, instagramStoryFilename, renderInstagramStory, storySvg, wrapWords } = require('./instagram-story');

const packet = {
  pick_id: '20260914-NFL-001',
  analysis: {
    extraction: {
      plays: [{ selection: 'Bijan Robinson', line: 'OVER 29.5 receiving yards', odds_american: '-140' }],
    },
  },
};

test('renders an Instagram Story PNG at the native 9:16 size', async () => {
  const png = await renderInstagramStory(packet);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, STORY_WIDTH);
  assert.equal(metadata.height, STORY_HEIGHT);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('story copy comes only from approved terms and escapes markup', () => {
  const svg = storySvg(packet);
  assert.match(svg, /Bijan Robinson/);
  assert.match(svg, /OVER 29\.5/);
  assert.match(svg, /receiving yards \(-140\)/);
  assert.doesNotMatch(svg, /source_claims|confidence|Twitter/);
  assert.equal(escapeXml('<pick & “line”>'), '&lt;pick &amp; “line”&gt;');
});

test('wraps long story lines and creates a safe filename', () => {
  assert.ok(wrapWords('A very long approved selection that needs multiple display lines', 18).length > 1);
  assert.equal(instagramStoryFilename('NFL/001 risky'), 'kobes-betting-hub-NFL-001-risky-story.png');
});
