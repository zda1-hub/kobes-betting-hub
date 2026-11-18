const TABLE_SQL = `CREATE TABLE IF NOT EXISTS x_audit_reports (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  json TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

async function ensureTable(db) {
  await db.prepare(TABLE_SQL).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_x_audit_reports_week_start ON x_audit_reports (week_start DESC)').run();
}

export async function xAuditReports(request, env) {
  if (!env.DB) return Response.json({ error: 'D1 unavailable' }, { status: 503 });
  await ensureTable(env.DB);
  if (request.method === 'GET') {
    const weekStart = new URL(request.url).searchParams.get('before');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || '')) return Response.json({ error: 'Invalid before date' }, { status: 400 });
    const row = await env.DB.prepare('SELECT id, week_start, json, markdown, created_at FROM x_audit_reports WHERE week_start < ? ORDER BY week_start DESC LIMIT 1').bind(weekStart).first();
    return Response.json({ report: row ? { id: row.id, week_start: row.week_start, json: JSON.parse(row.json), markdown: row.markdown, created_at: row.created_at } : null });
  }
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const raw = await request.text();
  if (raw.length > 100_000) return Response.json({ error: 'Report too large' }, { status: 413 });
  let input; try { input = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!/^x-week-\d{4}-\d{2}-\d{2}$/.test(input.id || '') ||
      input.id !== `x-week-${input.week_start}` ||
      typeof input.json !== 'object' || input.json === null || Array.isArray(input.json) ||
      typeof input.markdown !== 'string' || !input.markdown.startsWith('# KBH weekly X audit'))
    return Response.json({ error: 'Invalid report' }, { status: 422 });
  const createdAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO x_audit_reports (id, week_start, json, markdown, created_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, markdown=excluded.markdown, created_at=excluded.created_at`)
    .bind(input.id, input.week_start, JSON.stringify(input.json), input.markdown, createdAt).run();
  return Response.json({ id: input.id, week_start: input.week_start, created_at: createdAt });
}
