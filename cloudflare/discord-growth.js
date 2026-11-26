// Private D1 storage for Discord growth. The existing publisher bearer secret gates every route.
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const snowflake = /^\d{15,22}$/;
const codePattern = /^[A-Za-z0-9-]{2,64}$/;
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export function inviteDeltas(today, yesterday) {
  if (yesterday === null) return { status: 'baseline', counts: {} };
  const prior = new Map(yesterday.map(row => [row.invite_code, Number(row.uses)]));
  const counts = {};
  for (const row of today) {
    // A newly created invite starts at its first observed count, not zero.
    if (!prior.has(row.invite_code)) continue;
    const delta = Math.max(0, Number(row.uses) - prior.get(row.invite_code));
    if (delta) counts[row.label || 'other'] = (counts[row.label || 'other'] || 0) + delta;
  }
  // A deleted invite contributes no negative joins.
  return { status: 'measured', counts };
}

function previousDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

async function dailyReport(db, days, today) {
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startDate = start.toISOString().slice(0, 10);
  const priorStart = previousDate(startDate);
  const members = (await db.prepare('SELECT date, member_count, presence_count, taken_at FROM discord_member_snapshots WHERE date BETWEEN ? AND ? ORDER BY date').bind(priorStart, today).all()).results;
  const invites = (await db.prepare('SELECT date, invite_code, uses, label, channel_label FROM discord_invite_snapshots WHERE date BETWEEN ? AND ? ORDER BY date, invite_code').bind(priorStart, today).all()).results;
  const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  const fromUtc = `${startDate}T07:00:00Z`, toUtc = `${end.toISOString().slice(0, 10)}T07:00:00Z`;
  const events = (await db.prepare("SELECT substr(datetime(joined_at, '-7 hours'), 1, 10) AS date, COUNT(*) AS joins FROM discord_joins WHERE joined_at >= ? AND joined_at < ? GROUP BY substr(datetime(joined_at, '-7 hours'), 1, 10)").bind(fromUtc, toUtc).all()).results;
  const leaves = (await db.prepare("SELECT substr(datetime(left_at, '-7 hours'), 1, 10) AS date, COUNT(*) AS count FROM discord_joins WHERE left_at >= ? AND left_at < ? GROUP BY substr(datetime(left_at, '-7 hours'), 1, 10)").bind(fromUtc, toUtc).all()).results;
  const paidWeekStart = new Date(`${today}T12:00:00Z`); paidWeekStart.setUTCDate(paidWeekStart.getUTCDate() - 6);
  const paidFromUtc = `${paidWeekStart.toISOString().slice(0, 10)}T07:00:00Z`;
  const paid = (await db.prepare('SELECT COUNT(*) AS count FROM discord_joins WHERE joined_at >= ? AND joined_at < ? AND paid_role_at >= ? AND paid_role_at < ?').bind(paidFromUtc, toUtc, paidFromUtc, toUtc).first())?.count || 0;
  const m = new Map(members.map(row => [row.date, row]));
  const i = new Map();
  for (const row of invites) { if (!i.has(row.date)) i.set(row.date, []); i.get(row.date).push(row); }
  const e = new Map(events.map(row => [row.date, Number(row.joins)]));
  const l = new Map(leaves.map(row => [row.date, Number(row.count)]));
  const gatewayEventsAvailable = events.length > 0 || leaves.length > 0;
  const rows = [];
  for (let n = 0; n < days; n++) {
    const date = new Date(`${startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n);
    const key = date.toISOString().slice(0, 10);
    const current = m.get(key), prior = m.get(previousDate(key));
    if (!current) continue;
    const diff = inviteDeltas(i.get(key) || [], prior ? i.get(previousDate(key)) || [] : null);
    rows.push({ date: key, member_count: Number(current.member_count), presence_count: Number(current.presence_count),
      taken_at: current.taken_at, net_change: prior ? Number(current.member_count) - Number(prior.member_count) : null,
      invite_status: diff.status, joins_per_invite_label: diff.status === 'baseline' ? null : diff.counts,
      leaves: gatewayEventsAvailable ? l.get(key) || 0 : null,
      gateway_joins: gatewayEventsAvailable ? e.get(key) || 0 : null });
  }
  return { days: rows, gateway_events_available: gatewayEventsAvailable, new_joiners_paid_role_this_week: gatewayEventsAvailable ? Number(paid) : null };
}

export async function handleDiscordGrowth(request, env) {
  if (!env.DB) return reply({ error: 'D1 unavailable' }, 503);
  const url = new URL(request.url);
  if (url.pathname === '/admin/discord-growth' && request.method === 'GET') {
    const raw = url.searchParams.get('days') || '7';
    if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 31) return reply({ error: 'days must be 1..31' }, 400);
    const today = new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
    return reply(await dailyReport(env.DB, Number(raw), today));
  }
  if (url.pathname === '/api/admin/discord-growth/snapshot' && request.method === 'GET') {
    const date = url.searchParams.get('date');
    if (!dayPattern.test(date || '')) return reply({ error: 'Invalid date' }, 400);
    const row = await env.DB.prepare('SELECT date FROM discord_member_snapshots WHERE date = ?').bind(date).first();
    return reply({ exists: Boolean(row) });
  }
  if (url.pathname === '/api/admin/discord-growth/snapshot' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !dayPattern.test(body.date || '') || !Number.isInteger(body.member_count) || body.member_count < 0 ||
        !Number.isInteger(body.presence_count) || body.presence_count < 0 || !Array.isArray(body.invites) || body.invites.length > 1000 ||
        !Number.isFinite(Date.parse(body.taken_at))) return reply({ error: 'Invalid snapshot' }, 400);
    const codes = new Set();
    for (const row of body.invites) {
      if (!codePattern.test(row.code || '') || codes.has(row.code) || !Number.isInteger(row.uses) || row.uses < 0 ||
          typeof row.label !== 'string' || row.label.length > 80 || typeof row.channel_label !== 'string' || row.channel_label.length > 100)
        return reply({ error: 'Invalid invite' }, 400);
      codes.add(row.code);
    }
    // One transaction, and a repeat POST does not change the snapshot.
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO discord_member_snapshots(date,member_count,presence_count,taken_at) VALUES(?,?,?,?)')
        .bind(body.date, body.member_count, body.presence_count, body.taken_at),
      ...body.invites.map(row => env.DB.prepare('INSERT OR IGNORE INTO discord_invite_snapshots(date,invite_code,uses,label,channel_label) VALUES(?,?,?,?,?)')
        .bind(body.date, row.code, row.uses, row.label, row.channel_label))
    ]);
    return reply({ status: 'stored', date: body.date, invites: body.invites.length });
  }
  if (url.pathname === '/api/admin/discord-growth/event' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !['join', 'leave', 'paid_role'].includes(body.type) || !snowflake.test(body.user_id || '') ||
        !Number.isFinite(Date.parse(body.at || '')) || (body.invite_code !== null && body.invite_code !== undefined && !codePattern.test(body.invite_code)))
      return reply({ error: 'Invalid event' }, 400);
    if (body.type === 'join') {
      await env.DB.prepare('INSERT OR IGNORE INTO discord_joins(user_id,joined_at,invite_code) VALUES(?,?,?)')
        .bind(body.user_id, body.at, body.invite_code || null).run();
    } else if (body.type === 'leave') {
      await env.DB.prepare('UPDATE discord_joins SET left_at = ? WHERE user_id = ? AND joined_at = (SELECT MAX(joined_at) FROM discord_joins WHERE user_id = ? AND left_at IS NULL) AND left_at IS NULL')
        .bind(body.at, body.user_id, body.user_id).run();
    } else {
      await env.DB.prepare('UPDATE discord_joins SET paid_role_at = ? WHERE user_id = ? AND joined_at = (SELECT MAX(joined_at) FROM discord_joins WHERE user_id = ?) AND paid_role_at IS NULL')
        .bind(body.at, body.user_id, body.user_id).run();
    }
    return reply({ status: 'stored' });
  }
  return reply({ error: 'Not found' }, 404);
}
