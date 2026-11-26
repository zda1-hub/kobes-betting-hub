const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiscordGrowth, phoenixDay, dueAtPhoenix1155, uniqueJoinCode } = require('./discord-growth');

test('Phoenix schedule runs at 23:55 MST and uses the local date', () => {
  const at = new Date('2026-11-27T06:55:00Z');
  assert.equal(phoenixDay(at), '2026-11-26');
  assert.equal(dueAtPhoenix1155(at), true);
  assert.equal(dueAtPhoenix1155(new Date('2026-11-27T06:54:00Z')), false);
});

test('invite attribution requires exactly one known one-use increase', () => {
  assert.equal(uniqueJoinCode(new Map([['abc', 3]]), new Map([['abc', 4]])), 'abc');
  assert.equal(uniqueJoinCode(new Map([['abc', 3]]), new Map([['abc', 4], ['new', 1]])), 'abc');
  assert.equal(uniqueJoinCode(new Map([['abc', 3]]), new Map([['abc', 5]])), null);
  assert.equal(uniqueJoinCode(new Map([['abc', 3]]), new Map([['new', 1]])), null);
});

test('daily mock dry run makes two Discord reads and zero writes', async () => {
  const calls = [];
  const mock = async (url, options) => {
    calls.push({ url, method: options?.method || 'GET' });
    if (url.includes('with_counts=true')) return Response.json({ approximate_member_count: 1326, approximate_presence_count: 248 });
    if (url.endsWith('/invites')) return Response.json([{ code: 'sB9vzGz2xj', uses: 82, channel: { name: 'start-here' } }, { code: 'newcode', uses: 4, channel: { name: 'general' } }]);
    throw new Error('Unexpected write');
  };
  const job = createDiscordGrowth({ guildId: '1215407647155683358', discordToken: 'mock', publisherUrl: 'https://example.test', publisherSecret: 'mock', fetchImpl: mock });
  const receipt = await job.tick({ at: new Date('2026-11-27T06:55:00Z'), dryRun: true });
  assert.equal(receipt.status, 'dry_run');
  assert.equal(receipt.date, '2026-11-26');
  assert.deepEqual(receipt.invites.map(x => x.label), ['x-first-reply', 'other']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(x => x.method === 'GET'));
});

test('429 holds the run without a retry storm', async () => {
  let calls = 0;
  const job = createDiscordGrowth({ guildId: '1215407647155683358', discordToken: 'mock', publisherUrl: 'https://example.test', publisherSecret: 'mock',
    fetchImpl: async url => { calls++; if (url.includes('snapshot?')) return Response.json({ exists: false }); return new Response('', { status: 429, headers: { 'retry-after': '12' } }); } });
  await assert.rejects(job.tick({ at: new Date('2026-11-27T06:55:00Z') }), /retry-after 12s/);
  assert.equal(calls, 2); // one D1 status read, one Discord read; no retry
  assert.equal((await job.tick({ at: new Date('2026-11-27T06:56:00Z') })).status, 'already_running_or_done');
  assert.equal(calls, 2);
});
