'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { currentMarket, selectEvent } = require('./current-market');

test('uses the nearest upcoming event and rejects doubleheaders', () => {
  const rows = [
    { id: 'game0001', home_team: 'New York Knicks', away_team: 'Brooklyn Nets', commence_time: '2026-11-15T02:00:00Z' },
    { id: 'game0002', home_team: 'New York Knicks', away_team: 'Boston Celtics', commence_time: '2026-11-16T02:00:00Z' }
  ];
  assert.equal(selectEvent(rows, 'Brooklyn', Date.parse('2026-11-14T20:00:00Z')).id, 'game0001');
  assert.equal(selectEvent(rows, 'Knicks', Date.parse('2026-11-14T20:00:00Z')).id, 'game0001');
  assert.throws(() => selectEvent([rows[0], { ...rows[1], commence_time: '2026-11-15T05:00:00Z' }],
    'Knicks', Date.parse('2026-11-14T20:00:00Z')), /Multiple near-term/);
  assert.throws(() => selectEvent([], 'Knicks', Date.parse('2026-11-14T20:00:00Z')), /lists no upcoming events/);
  assert.throws(() => selectEvent(rows, '76ers', Date.parse('2026-11-14T20:00:00Z')),
    /Provider lists 2 upcoming event\(s\); nearest: Brooklyn Nets at New York Knicks/);
});

test('one-market live research honors monthly and shared credit limits', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-current-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date('2026-11-14T20:00:00Z');
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    const data = url.endsWith('/sports/') ? [] : url.endsWith('/events') ?
      [{ id: 'event1234', home_team: 'New York Knicks', away_team: 'Brooklyn Nets', commence_time: '2026-11-15T02:00:00Z' }] :
      { id: 'event1234', commence_time: '2026-11-15T02:00:00Z', home_team: 'New York Knicks', away_team: 'Brooklyn Nets',
        bookmakers: [{ key: 'book', title: 'Book', markets: [{ key: 'player_points_alternate', last_update: '2026-11-14T19:58:00Z',
          outcomes: [{ name: 'Over', description: 'Jalen Brunson', point: 20.5, price: -180 }] }] }] };
    return { ok: true, headers: { get: name => name === 'x-requests-remaining' ? '9000' : null }, json: async () => data };
  };
  const query = { root, apiKey: 'secret', sport: 'NBA', team: 'Brooklyn', player: 'Jalen Brunson',
    stat: 'points', side: 'over', line: 20.5, fetchImpl, now };
  const result = await currentMarket(query);
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].odds, -180);
  assert.match(seen[2], /markets=player_points_alternate/);
  assert.equal(seen.some(url => url.includes('secret')), false);
  const ledger = JSON.parse(await fs.readFile(path.join(root, 'trends-odds-budget', '2026-11.json'), 'utf8'));
  assert.equal(ledger.reserved, 1);
  await assert.rejects(currentMarket({ ...query, fetchImpl: async url => ({
    ok: true, headers: { get: name => name === 'x-requests-remaining' ? '5000' : null },
    json: async () => url.endsWith('/events') ? [{ id: 'event1234', home_team: 'New York Knicks',
      away_team: 'Brooklyn Nets', commence_time: '2026-11-15T02:00:00Z' }] : []
  }) }), /reserve/);
  const budgetFile = path.join(root, 'trends-odds-budget', '2026-11.json');
  await fs.writeFile(budgetFile, JSON.stringify({ version: 1, month: '2026-11', reserved: 300, requests: [] }));
  let paidCall = false;
  await assert.rejects(currentMarket({ ...query, fetchImpl: async url => {
    if (url.includes('/odds?')) paidCall = true;
    return { ok: true, headers: { get: () => '9000' }, json: async () =>
      [{ id: 'event1234', home_team: 'New York Knicks', away_team: 'Brooklyn Nets', commence_time: '2026-11-15T02:00:00Z' }] };
  } }), /monthly/);
  assert.equal(paidCall, false);
});
