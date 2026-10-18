const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fetchBufferedPosts, acknowledgeBufferedPosts } = require('./x-fetch-buffer');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'x-buffer-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return path.join(root, 'source.json');
}
const page = (...ids) => ({ data: ids.map(id => ({ id, text: `source ${id}`, attachments: { media_keys: [`media-${id}`] } })),
  includes: { media: ids.map(id => ({ media_key: `media-${id}`, url: `https://example.test/${id}.jpg` })) },
  meta: { newest_id: ids[0] } });

test('deferred records survive restart, use independent fetch cursor and retain media', async t => {
  const file = await fixture(t);
  await fetchBufferedPosts({ file, epoch: 'day-one', startTime: 'midnight', fetchPage: async () => page('102', '101') });
  await acknowledgeBufferedPosts(file, 'day-one', ['102']);
  const calls = [];
  const result = await fetchBufferedPosts({ file, epoch: 'day-one', startTime: 'midnight', fetchPage: async args => { calls.push(args); return page('103'); } });
  assert.equal(calls[0].sinceId, '102');
  assert.equal(calls[0].startTime, undefined);
  assert.deepEqual(result.pages.flatMap(p => p.data.map(p => p.id)), ['101', '103']);
  assert.equal(result.pages[0].includes.media[1].url, 'https://example.test/101.jpg');
  assert.equal(result.newest_id, '103');
});

test('a fully drained buffer still retains its fetch high-water mark', async t => {
  const file = await fixture(t);
  await fetchBufferedPosts({ file, epoch: 'day', fetchPage: async () => page('20') });
  await acknowledgeBufferedPosts(file, 'day', ['20']);
  const result = await fetchBufferedPosts({ file, epoch: 'day', fetchPage: async args => { assert.equal(args.sinceId, '20'); return {}; } });
  assert.equal(result.pending, 0);
  assert.equal(result.newest_id, '20');
});

test('pagination is complete before persisting cursor; overlapping IDs deduplicate', async t => {
  const file = await fixture(t); let calls = 0;
  const result = await fetchBufferedPosts({ file, epoch: 'day', sinceId: '8', fetchPage: async args => {
    calls++;
    assert.equal(args.sinceId, '8');
    if (!args.nextToken) return { ...page('12', '11'), meta: { newest_id: '12', next_token: 'page-two' } };
    assert.equal(args.nextToken, 'page-two'); return page('11', '10');
  }});
  assert.equal(calls, 2); assert.equal(result.pending, 3); assert.equal(result.newest_id, '12');
});

test('page failure leaves durable pending data and cursor unchanged', async t => {
  const file = await fixture(t);
  await fetchBufferedPosts({ file, epoch: 'day', fetchPage: async () => page('10') });
  const before = await fs.readFile(file, 'utf8');
  await assert.rejects(fetchBufferedPosts({ file, epoch: 'day', fetchPage: async args => {
    if (!args.nextToken) return { ...page('12'), meta: { newest_id: '12', next_token: 'two' } };
    throw new Error('X unavailable');
  }}), /unavailable/);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('new operating day resets stale backlog and performs fresh catch-up', async t => {
  const file = await fixture(t);
  await fetchBufferedPosts({ file, epoch: 'old-day', fetchPage: async () => page('10') });
  const next = await fetchBufferedPosts({ file, epoch: 'new-day', startTime: 'new-midnight', fetchPage: async args => {
    assert.equal(args.sinceId, undefined); assert.equal(args.startTime, 'new-midnight'); return page('20');
  }});
  await acknowledgeBufferedPosts(file, 'old-day', ['20']);
  assert.equal(next.pending, 1);
  assert.equal(JSON.parse(await fs.readFile(file)).pages[0].data[0].id, '20');
});

test('corrupt buffers fail closed rather than discard backlog', async t => {
  const file = await fixture(t); await fs.writeFile(file, '{');
  await assert.rejects(fetchBufferedPosts({ file, epoch: 'day', fetchPage: async () => page('10') }));
  await fs.writeFile(file, '{}');
  await assert.rejects(fetchBufferedPosts({ file, epoch: 'day', fetchPage: async () => page('10') }), /Invalid X fetch buffer/);
});

test('partial-error responses do not silently advance the cursor', async t => {
  const file = await fixture(t);
  await assert.rejects(fetchBufferedPosts({ file, epoch: 'day', fetchPage: async () => ({ ...page('10'), errors: [{ detail: 'partial result' }] }) }), /Incomplete/);
  await assert.rejects(fs.readFile(file), { code: 'ENOENT' });
});

test('large X IDs retain exact ordering beyond JavaScript number precision', async t => {
  const file = await fixture(t);
  const result = await fetchBufferedPosts({ file, epoch: 'day', fetchPage: async () => page('2111852062183223770', '2111852062183223769') });
  assert.equal(result.newest_id, '2111852062183223770');
});
