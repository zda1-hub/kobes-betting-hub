import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from './bettinghub-publisher.js';

function memoryD1() {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (sql, args = []) => ({
    bind(...values) { return wrap(sql, values); },
    async run() { return { meta: sqlite.prepare(sql).run(...args) }; },
    async first() { return sqlite.prepare(sql).get(...args) || null; }
  });
  return { prepare: sql => wrap(sql), close: () => sqlite.close() };
}

test('audit report endpoint requires its own secret and persists only valid reports', async () => {
  const DB = memoryD1();
  const env = { DB, X_AUDIT_INGEST_SECRET: 'private-test-secret' };
  const url = 'https://example.test/api/admin/x-audit-reports';
  const noAuth = await worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env, {});
  assert.equal(noAuth.status, 401);
  const report = { id: 'x-week-2026-11-09', week_start: '2026-11-09',
    json: { summary: { total: 1, standalone: 1 } }, markdown: '# KBH weekly X audit — 2026-11-09' };
  const put = await worker.fetch(new Request(url, { method: 'POST', headers: { authorization: 'Bearer private-test-secret' }, body: JSON.stringify(report) }), env, {});
  assert.equal(put.status, 200);
  const prior = await worker.fetch(new Request(`${url}?before=2026-11-16`, { headers: { authorization: 'Bearer private-test-secret' } }), env, {});
  assert.equal(prior.status, 200);
  assert.deepEqual((await prior.json()).report.json, report.json);
  const invalid = await worker.fetch(new Request(url, { method: 'POST', headers: { authorization: 'Bearer private-test-secret' }, body: JSON.stringify({ ...report, week_start: '2026-11-10' }) }), env, {});
  assert.equal(invalid.status, 422);
  DB.close();
});
