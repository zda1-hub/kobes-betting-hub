const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { resultStorySvg, renderResultStory, queueApprovedResultStory } = require('./free-pick-result-story');

const copy = 'That one got there.\n\nFREE PICK RESULT: WIN\nPJ Washington over 1.5 threes | 1.5 | -113\nFinal: 3 made threes on 6 attempts';

test('approved result Story keeps exact wager and final on a 1080 by 1920 JPEG', async () => {
  const svg = resultStorySvg(copy);
  assert.match(svg, /PJ Washington over 1\.5/);
  assert.match(svg, /threes \| 1\.5 \| -113/);
  assert.match(svg, /Final: 3 made threes on 6/);
  assert.match(svg, />attempts<\/text>/);
  assert.match(svg, /discord\.gg\/sB9vzGz2xj/);
  assert.doesNotMatch(svg, /austinprops|Original pick:/);
  const image = await renderResultStory(copy);
  const meta = await sharp(image).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
  assert.equal(meta.format, 'jpeg');
  assert.throws(() => resultStorySvg('CASHHH'), /exact approved grade/);
});

test('Instagram result queue is called only with approved facts and a stable digest', async () => {
  let request;
  const receipt = await queueApprovedResultStory({
    row: { pick_id: '20261109-181-X', result_verified_at: new Date().toISOString(), result_verified_source: 'https://nba.com/box-score' },
    copy, approvedBy: '1209660006383755265', resultDigest: 'a'.repeat(20),
    environment: { FREE_PICK_SITE_PUBLISH_SECRET: 'fixture-secret' },
    render: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    fetchImpl: async (url, init) => { request = { url, init }; return Response.json({ status: 'approved' }, { status: 201 }); },
  });
  assert.equal(receipt.status, 'approved');
  assert.equal(request.init.body.get('pickId'), '20261109-181-X');
  assert.equal(request.init.body.get('copy'), copy);
  assert.equal(request.init.body.get('resultDigest'), 'a'.repeat(20));
  assert.equal(request.init.body.get('approvedBy'), '1209660006383755265');
});

test('held Instagram delivery cannot be reported as queued', async () => {
  await assert.rejects(() => queueApprovedResultStory({
    row: { pick_id: '20261109-181-X', result_verified_at: new Date().toISOString(), result_verified_source: 'Official box score' },
    copy, approvedBy: '1209660006383755265', resultDigest: 'a'.repeat(20),
    environment: { FREE_PICK_SITE_PUBLISH_SECRET: 'fixture-secret' },
    render: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    fetchImpl: async () => Response.json({ status: 'already_queued', state: 'held' }),
  }), /needs attention/);
});
