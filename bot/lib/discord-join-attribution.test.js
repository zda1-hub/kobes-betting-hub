const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiscordJoinAttribution, parseCampaigns, recordDiscordJoin, uniqueIncrement } = require('./discord-join-attribution');

const collection = (rows) => new Map(rows.map((row) => [row.code, row]));

test('campaign configuration is explicit and bounded', () => {
  const result = parseCampaigns(JSON.stringify({ xFall: { source: 'kobe_x', campaign: 'fall', referral_code: 'KBC-X' } }));
  assert.deepEqual(result.get('xFall'), {
    source: 'kobe_x', medium: 'discord_invite', campaign: 'fall', content: null, referral_code: 'KBC-X'
  });
  assert.throws(() => parseCampaigns('{'), /valid JSON/);
});

test('only one uniquely incremented invite can be attributed', () => {
  assert.equal(uniqueIncrement(new Map([['xx', 2], ['ig', 4]]), new Map([['xx', 3], ['ig', 4]])), 'xx');
  assert.equal(uniqueIncrement(new Map([['xx', 2], ['ig', 4]]), new Map([['xx', 3], ['ig', 5]])), null);
  assert.equal(uniqueIncrement(new Map([['xx', 2]]), new Map([['xx', 2]])), null);
});

test('member join writes mapped campaign metadata and refreshes the snapshot', async () => {
  const calls = [];
  let invites = collection([{ code: 'xFall', uses: 5 }]);
  const guild = { id: 'guild-1', invites: { fetch: async () => invites } };
  const tracker = createDiscordJoinAttribution({
    campaigns: parseCampaigns('{"xFall":{"source":"kobe_x","campaign":"fall"}}'),
    supabaseUrl: 'https://db.test', supabaseKey: 'secret',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201 }; }
  });
  await tracker.initialize(guild);
  invites = collection([{ code: 'xFall', uses: 6 }]);
  const event = await tracker.joined({ id: 'member-1', guild });
  assert.equal(event.properties.attribution_status, 'attributed');
  assert.equal(event.properties.source, 'kobe_x');
  assert.equal(event.properties.invite_code, 'xFall');
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.headers.prefer, /ignore-duplicates/);
});

test('ambiguous increments are recorded as unknown without leaking an invite code', async () => {
  let invites = collection([{ code: 'xx', uses: 1 }, { code: 'ig', uses: 1 }]);
  const guild = { id: 'guild-1', invites: { fetch: async () => invites } };
  const written = [];
  const tracker = createDiscordJoinAttribution({
    campaigns: parseCampaigns('{"xx":{"source":"x"},"ig":{"source":"instagram"}}'),
    supabaseUrl: 'https://db.test', supabaseKey: 'secret',
    fetchImpl: async (_url, init) => { written.push(JSON.parse(init.body)); return { ok: true }; }
  });
  await tracker.initialize(guild);
  invites = collection([{ code: 'xx', uses: 2 }, { code: 'ig', uses: 2 }]);
  const event = await tracker.joined({ id: 'member-2', guild });
  assert.equal(event.properties.attribution_status, 'unknown');
  assert.equal(event.properties.attribution_reason, 'NO_UNIQUE_INCREMENT');
  assert.equal(event.properties.invite_code, null);
  assert.equal(written.length, 1);
});

test('database fallback writes the same idempotent analytics event without a Supabase key', async () => {
  const queries = [];
  class FakePool {
    constructor(options) { this.options = options; }
    on() {}
    async query(text, values) { queries.push({ text, values, options: this.options }); }
  }
  const event = {
    id: 'event-1', dedupe_key: 'discord_join:guild-1:member-3', event_name: 'discord_join',
    discord_user_id: 'member-3', path: null, properties: { source: 'instagram' },
    occurred_at: '2026-09-22T12:00:00.000Z'
  };
  await recordDiscordJoin({ databaseUrl: 'postgres://db.test/app', PoolClass: FakePool, event });
  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.equal(queries[0].values[1], event.dedupe_key);
  assert.deepEqual(JSON.parse(queries[0].values[5]), event.properties);
});

test('Supabase REST remains preferred when both storage configurations exist', async () => {
  let fetchCalls = 0;
  class UnexpectedPool { constructor() { throw new Error('database fallback should not be opened'); } }
  await recordDiscordJoin({
    supabaseUrl: 'https://db.test', supabaseKey: 'secret', databaseUrl: 'postgres://db.test/app',
    PoolClass: UnexpectedPool,
    fetchImpl: async () => { fetchCalls += 1; return { ok: true, status: 201 }; },
    event: { dedupe_key: 'discord_join:guild:member' }
  });
  assert.equal(fetchCalls, 1);
});

test('join attribution fails clearly when neither write path is configured', async () => {
  await assert.rejects(
    recordDiscordJoin({ event: {} }),
    /requires either SUPABASE_URL with SUPABASE_SECRET_KEY or DATABASE_URL/
  );
});
