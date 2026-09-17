import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { Pool } = require('pg');
const { recoverAuditedExclusive } = require('../pipeline/collect-x');
const { closeAuditStore } = require('../pipeline/audit-store');
const postIds = process.argv.slice(2);
if (!postIds.length || postIds.length > 5 || postIds.some(id => !/^\d{10,25}$/.test(id))) {
  throw new Error('Provide one to five exact audited X post IDs.');
}
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, query_timeout: 10000 });
try {
  await db.query('BEGIN READ ONLY');
  const { rows } = await db.query(`
    SELECT s.*, e.id AS extraction_run_id, e.raw_structured_output,
           e.prompt_version, e.model, e.completed_at
    FROM source_posts s JOIN LATERAL (
      SELECT * FROM extraction_runs WHERE source_post_id=s.id AND status=$2
      ORDER BY completed_at DESC LIMIT 1
    ) e ON TRUE WHERE s.external_post_id=ANY($1)`, [postIds, 'SUCCEEDED']);
  await db.query('COMMIT');
  for (const id of postIds) {
    const row = rows.find(entry => entry.external_post_id === id);
    if (!row) throw new Error(`No successful audited extraction for ${id}.`);
    console.log(JSON.stringify(await recoverAuditedExclusive(row)));
  }
} finally {
  await db.end();
  await closeAuditStore();
}
