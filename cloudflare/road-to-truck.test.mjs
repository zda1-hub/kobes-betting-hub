import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { roadToTruck, __test } from './road-to-truck.js';

function db() {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (sql, args = []) => ({
    bind(...values) { return wrap(sql, values); },
    async run() { const out = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(out.changes) } }; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  });
  return { prepare: sql => wrap(sql), close: () => sqlite.close() };
}
function req(action, body) { return new Request(`https://example.test/api/admin/road-to-truck/${action}`, { method: 'POST', body: JSON.stringify(body) }); }

test('X posts with no approval when on; the same id never posts twice', async () => {
  const DB = db(); let calls = 0;
  const body = { id: 'truck-day-1', platform: 'x', text: 'day 1. 21+ | not a guarantee', first_reply: '21+ free discord' };
  const deps = { postX: async () => String(++calls).padStart(18, '1') };
  const env = { DB };
  const first = await roadToTruck(req('x', body), env, deps);
  assert.equal((await first.json()).status, 'posted'); assert.equal(calls, 2);
  const second = await roadToTruck(req('x', body), env, deps);
  assert.equal((await second.json()).status, 'already_handled'); assert.equal(calls, 2);
  DB.close();
});
test('X compliance catches bad text before claim', async () => {
  const DB = db(); let calls = 0;
  const body = { id: 'truck-day-2', platform: 'x', text: '21+ lock', first_reply: '21+ reply' };
  const blocked = await roadToTruck(req('x', body), { DB }, { postX: async () => { calls++; } });
  assert.equal(blocked.status, 422); assert.equal(calls, 0);
  assert.equal(__test.compliance('21+ parlay', 'x'), 'Blocked claim');
  DB.close();
});
test('D1 record uses 26-17 fallback when graded table is absent', async () => {
  const DB = db(); const result = await roadToTruck(new Request('https://example.test/api/admin/road-to-truck/record'), { DB });
  assert.equal((await result.json()).record, '26-17'); DB.close();
});
