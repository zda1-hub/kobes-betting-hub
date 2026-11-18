const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatTag, complianceFlags, phoenixDate, phoenixTime, windowFor, readX, aggregate, markdown } = require('./x-weekly-audit');
const { run } = require('./run-x-weekly-audit');

test('tags free picks, results, media memes and own-thread replies', () => {
  assert.equal(formatTag({ text: 'KBH FREE CARD | NBA' }), 'free_pick');
  assert.equal(formatTag({ text: 'Ayo over 3.5 assists. Join our free Discord for more approved plays like this.' }), 'free_pick');
  assert.equal(formatTag({ text: 'Free picks yesterday: 3-3. Losses first.' }), 'record_recap');
  assert.equal(formatTag({ text: '❌ MISSED: final stat 3' }), 'result');
  assert.equal(formatTag({ text: 'Whatever makes her happy 😂', attachments: { media_keys: ['a'] } }), 'meme_hype');
  assert.equal(formatTag({ text: 'More context', referenced_tweets: [{ type: 'replied_to', id: '1' }] }, new Set(['1'])), 'thread');
  assert.equal(formatTag({ text: 'Read more https://kobesbettinghub.com/about' }), 'link_post');
});

test('flags policy terms, profit, sportsbook, parlay promotion, age and misplaced Discord link', () => {
  const post = { id: '1', text: 'LOCK: $500 profit on DraftKings. Tail this parlay! https://discord.gg/abc', created_at: '2026-11-17T12:00:00Z' };
  assert.deepEqual(complianceFlags(post), ['lock_or_guaranteed', 'dollar_profit_claim', 'sportsbook_name', 'parlay_promo', 'missing_21_plus', 'discord_link_outside_first_reply']);
  const first = { id: '2', text: '21+ Free Discord: https://discord.gg/abc', created_at: '2026-11-17T12:01:00Z', referenced_tweets: [{ type: 'replied_to', id: '1' }] };
  assert.deepEqual(complianceFlags(first, { allPosts: [post, first] }), []);
  const shortened = { id: '3', text: '21+ Free Discord: https://t.co/link', entities: { urls: [{ expanded_url: 'https://discord.gg/abc' }] } };
  assert.deepEqual(complianceFlags(shortened), ['discord_link_outside_first_reply']);
});

test('converts UTC into fixed Phoenix MST and uses seven complete days', () => {
  assert.equal(phoenixDate('2026-11-17T06:59:00Z'), '2026-11-16');
  assert.equal(phoenixTime('2026-11-17T06:59:00Z'), '23:59 MST');
  assert.deepEqual(windowFor(new Date('2026-11-23T14:00:00Z')), {
    weekStart: '2026-11-16', start: '2026-11-16T07:00:00.000Z', end: '2026-11-23T07:00:00.000Z'
  });
});

test('backs off on 429 at most twice and counts every read', async () => {
  const calls = []; const delays = []; const state = { reads: 0 };
  const fetchImpl = async (_url, options) => {
    calls.push(options.method);
    return { status: calls.length < 3 ? 429 : 200, ok: calls.length === 3,
      headers: { get: () => '1' }, json: async () => ({ data: { id: 'x' } }) };
  };
  const result = await readX('https://api.x.com/2/users/by/username/kobesbettinghub', {
    token: 'test', fetchImpl, state, sleep: async ms => delays.push(ms)
  });
  assert.equal(result.data.id, 'x'); assert.deepEqual(calls, ['GET', 'GET', 'GET']);
  assert.deepEqual(delays, [1000, 1000]); assert.equal(state.reads, 3);
  let failures = 0;
  await assert.rejects(readX('https://api.x.com/2/users/by/username/kobesbettinghub', {
    token: 'test', state: { reads: 0 }, sleep: async () => {},
    fetchImpl: async () => { failures++; return { status: 429, ok: false, headers: { get: () => null } }; }
  }), /HTTP 429/);
  assert.equal(failures, 3);
});

test('dry run reports live-like posts without any save or Discord write', async () => {
  const calls = { save: 0, post: 0, previous: 0 };
  const receipt = await run({ dryRun: true, now: new Date('2026-11-23T14:00:00Z'),
    env: { KBH_X_HANDLE: 'kobesbettinghub', X_BEARER_TOKEN: 'test' },
    fetchPosts: async () => ({ posts: [{ id: '42', text: '21+ Free pick', created_at: '2026-11-17T18:00:00Z', public_metrics: { impression_count: 100, like_count: 2, reply_count: 1, retweet_count: 0, bookmark_count: 1 } }], reads: 2 }),
    getPrevious: async () => { calls.previous++; return null; },
    save: async () => { calls.save++; }, post: async () => { calls.post++; } });
  assert.equal(receipt.writes, 0); assert.deepEqual(calls, { save: 0, post: 0, previous: 1 });
  assert.match(receipt.markdown, /Post times and formats/);
  assert.match(receipt.markdown, /https:\/\/x\.com\/kobesbettinghub\/status\/42/);
  assert.equal(receipt.report.summary.total, 1);
});

test('aggregates week-over-week change and visible metrics without inventing unavailable ones', () => {
  const range = windowFor(new Date('2026-11-23T14:00:00Z'));
  const report = aggregate([{ id: '42', text: '21+ Free pick', created_at: '2026-11-17T18:00:00Z', public_metrics: { like_count: 2 } }], 'kobesbettinghub', range, { summary: { total: 3, standalone: 2 } });
  assert.equal(report.weekOverWeek.totalChange, -2);
  assert.equal(report.posts[0].views, null);
  assert.equal(report.formats.free_pick.views, null);
  assert.match(markdown(report), /N\/A/);
});
