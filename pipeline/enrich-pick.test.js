const test = require('node:test');
const assert = require('node:assert/strict');
const { extractionRequest } = require('./enrich-pick');

const packet = {
  source: {
    handle: 'example',
    post_url: 'https://x.com/example/status/1',
    posted_at: '2026-09-12T00:00:00Z',
    text: 'Example pick',
    media_urls: ['https://example.com/card.png']
  }
};

test('uses Luna with bounded output, no storage, and auditable request metadata', () => {
  const { model, imageDetail, requestBody } = extractionRequest(packet, {});
  assert.equal(model, 'gpt-5.6-luna');
  assert.equal(imageDetail, 'high');
  assert.equal(requestBody.max_output_tokens, 3000);
  assert.equal(requestBody.store, false);
  assert.deepEqual(requestBody.reasoning, { effort: 'none' });
  assert.equal(requestBody.input[0].content[1].detail, 'high');
  assert.match(requestBody.prompt_cache_key, /^kobes-betting-hub:/);
});

test('allows a controlled low-detail image benchmark without changing code', () => {
  const { requestBody } = extractionRequest(packet, {
    OPENAI_PICK_IMAGE_DETAIL: 'low',
    OPENAI_PICK_MAX_OUTPUT_TOKENS: '1200',
    OPENAI_PICK_REASONING_EFFORT: 'low'
  });
  assert.equal(requestBody.input[0].content[1].detail, 'low');
  assert.equal(requestBody.max_output_tokens, 1200);
  assert.deepEqual(requestBody.reasoning, { effort: 'low' });
});
test('Telegram extraction considers visible source credit without using the relay as capper',()=>{
  const telegram={source:{...packet.source,platform:'Telegram',handle:'cappers-free',
    post_url:'https://t.me/c/3593544389/1',text:'Kleos',author_signature:'Kleos'}};
  const {requestBody}=extractionRequest(telegram,{});
  const prompt=requestBody.input[0].content[0].text;
  assert.match(prompt,/Telegram channel post/);
  assert.match(prompt,/Post author signature: Kleos/);
  assert.match(prompt,/CAPPERS FREE is the relay channel, not the capper/);
});
