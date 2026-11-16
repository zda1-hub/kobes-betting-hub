import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES, createOptionalBdlProvider } from './trends-bdl-optional.js';
import publisher from './bettinghub-publisher.js';

test('all five optional leagues make zero requests while off or without a key', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not call'); };
  for (const sport of Object.keys(LEAGUES)) {
    const league = LEAGUES[sport];
    const off = createOptionalBdlProvider(sport, { env: { [league.secret]: 'fixture' }, fetchImpl });
    assert.deepEqual(off.status(), { sport, enabled: false, keyConfigured: true });
    await assert.rejects(off.read('schedule', { 'dates[]': '2026-11-16' }), /disabled/);
    const missing = createOptionalBdlProvider(sport, { env: { [league.flag]: 'true' }, fetchImpl });
    await assert.rejects(missing.read('schedule', { 'dates[]': '2026-11-16' }), /key missing/);
  }
  assert.equal(calls, 0);
});

test('one flag and one secret activate only that league and its documented route', async () => {
  for (const sport of Object.keys(LEAGUES)) {
    const league = LEAGUES[sport];
    const seen = [];
    const provider = createOptionalBdlProvider(sport, {
      env: { [league.flag]: 'true', [league.secret]: 'fixture' },
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 });
      }
    });
    assert.equal(provider.status().enabled, true);
    await provider.read('schedule', { 'dates[]': '2026-11-16', per_page: 25 });
    assert.match(seen[0].url, new RegExp(`${league.prefix}/`));
    assert.equal(seen[0].init.headers.Authorization, 'fixture');
    await assert.rejects(provider.read('gameStats'), /filter required/);
    await assert.rejects(provider.read('schedule', { 'dates[]': '2026-11-16', per_page: 101 }), /too large/);
    assert.equal(seen.length, 1);
  }
});

test('Worker route is private and stays disabled with a key alone', async () => {
  const url = 'https://example.test/api/trends/bdl/nhl/schedule?dates%5B%5D=2026-11-16';
  const env = { TRENDS_QUEUE_SECRET: 'fixture', BDL_NHL_API_KEY: 'fixture',
    TRENDS_BDL_NHL_ENABLED: 'false' };
  const unauthorized = await publisher.fetch(new Request(url), env, {});
  assert.equal(unauthorized.status, 401);
  const headers = { authorization: 'Bearer fixture' };
  const disabled = await publisher.fetch(new Request(url, { headers }), env, {});
  assert.equal(disabled.status, 503);
  const status = await publisher.fetch(new Request(url.replace('/schedule?', '/status?'),
    { headers }), env, {});
  assert.deepEqual(await status.json(), { sport: 'nhl', enabled: false, keyConfigured: true });
});
