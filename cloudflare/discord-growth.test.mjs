import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { inviteDeltas, handleDiscordGrowth } from './discord-growth.js';

function db() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations/005_discord_growth.sql', import.meta.url), 'utf8'));
  const wrap = (sql, args = []) => ({ bind(...values) { return wrap(sql, values); },
    async run() { return sqlite.prepare(sql).run(...args); },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; } });
  return { prepare: sql => wrap(sql), batch: async statements => { sqlite.exec('BEGIN'); try { const rows = []; for (const s of statements) rows.push(await s.run()); sqlite.exec('COMMIT'); return rows; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } }, close: () => sqlite.close() };
}

test('invite diffs baseline, new invite, deleted invite, and unknown label', () => {
  assert.deepEqual(inviteDeltas([{ invite_code: 'a', uses: 9, label: 'x' }], null), { status: 'baseline', counts: {} });
  assert.deepEqual(inviteDeltas([{ invite_code: 'a', uses: 12, label: 'x' }, { invite_code: 'new', uses: 5, label: 'other' }], [{ invite_code: 'a', uses: 9 }]), { status: 'measured', counts: { x: 3 } });
  assert.deepEqual(inviteDeltas([{ invite_code: 'a', uses: 12, label: 'other' }], [{ invite_code: 'a', uses: 10 }, { invite_code: 'deleted', uses: 42 }]), { status: 'measured', counts: { other: 2 } });
});

test('private endpoint shape, baseline, paid-role count, and no user IDs', async () => {
  const database = db();
  const date = new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
  const yesterday = new Date(`${date}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const prior = yesterday.toISOString().slice(0, 10);
  const snapshot = (d, count, uses) => ({ date: d, member_count: count, presence_count: 10, taken_at: `${d}T20:00:00Z`, invites: [{ code: 'sB9vzGz2xj', uses, label: 'x-first-reply', channel_label: 'start-here' }] });
  for (const value of [snapshot(prior, 100, 10), snapshot(date, 103, 12)]) {
    const r = await handleDiscordGrowth(new Request('https://example.test/api/admin/discord-growth/snapshot', { method: 'POST', body: JSON.stringify(value) }), { DB: database });
    assert.equal(r.status, 200);
  }
  const joined = `${date}T20:00:00Z`;
  for (const value of [{ type: 'join', user_id: '123456789012345678', at: joined, invite_code: 'sB9vzGz2xj' }, { type: 'paid_role', user_id: '123456789012345678', at: `${date}T21:00:00Z`, invite_code: null }])
    assert.equal((await handleDiscordGrowth(new Request('https://example.test/api/admin/discord-growth/event', { method: 'POST', body: JSON.stringify(value) }), { DB: database })).status, 200);
  const response = await handleDiscordGrowth(new Request('https://example.test/admin/discord-growth?days=2'), { DB: database });
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['days', 'gateway_events_available', 'new_joiners_paid_role_this_week']);
  assert.equal(body.days.at(-1).net_change, 3);
  assert.equal(body.days.at(-1).joins_per_invite_label['x-first-reply'], 2);
  assert.equal(body.days[0].invite_status, 'baseline');
  assert.equal(body.new_joiners_paid_role_this_week, 1);
  assert.equal(JSON.stringify(body).includes('123456789012345678'), false);
  database.close();
});
