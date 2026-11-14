const test = require('node:test');
const assert = require('node:assert/strict');
const { events, eventAlternateOdds, normalizeSelections } = require('./odds-api');

test('event odds use the real event-scoped endpoint and keep the key out of the URL', async () => {
  let observed;
  const response = {
    id: '12345678', commence_time: '2026-11-15T01:00:00Z',
    home_team: 'Home', away_team: 'Away',
    bookmakers: [{ key: 'examplebook', title: 'Example Book', last_update: '2026-11-14T20:00:00Z',
      markets: [{ key: 'player_receptions_alternate', outcomes: [
        { name: 'Over', description: 'A. Player', point: 3.5, price: -180 },
        { name: 'Over', description: 'B. Player', point: null, price: -150 }
      ] }] }]
  };
  const fetchImpl = async (url, options) => {
    observed = { url, options };
    return { ok: true, headers: { get: () => '495' }, json: async () => response };
  };
  const result = await eventAlternateOdds('NFL', '12345678', { apiKey: 'private-key', fetchImpl });
  assert.match(observed.url, /\/events\/12345678\/odds\?/);
  assert.match(observed.url, /player_receptions_alternate/);
  assert.doesNotMatch(observed.url, /private-key/);
  assert.equal(observed.options.headers['x-api-key'], 'private-key');
  assert.equal(result.remainingCredits, 495);
  assert.equal(result.selections.length, 1);
  assert.equal(result.selections[0].player, 'A. Player');
  assert.equal(result.selections[0].updatedAt, '2026-11-14T20:00:00Z');
});

test('events are read-only and market records with no player or price are excluded', async () => {
  const fetched = await events('NBA', { apiKey: 'key', fetchImpl: async () => ({
    ok: true, headers: { get: () => null }, json: async () => []
  }) });
  assert.deepEqual(fetched.data, []);
  assert.equal(fetched.remainingCredits, null);
  assert.deepEqual(normalizeSelections({ bookmakers: [{ markets: [{ key: 'player_points_alternate', outcomes: [
    { name: 'Over', point: 9.5, price: -200 }
  ] }] }] }, 'NBA'), []);
  await assert.rejects(() => eventAlternateOdds('NBA', '../secret', { apiKey: 'key' }), /Invalid event ID/);
});
