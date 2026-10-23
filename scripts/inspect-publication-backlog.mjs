import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { operationCheckConfig } from './check-membership-operations.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const { databaseUrl } = operationCheckConfig();
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 25_000 });

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(`
      SELECT p.pick_id, p.created_at, p.updated_at,
             p.ledger_entry->>'destination' AS destination,
             p.ledger_entry->>'selection' AS selection,
             p.ledger_entry->>'market' AS market,
             p.exact_payload, p.post_reference, p.discord_channel_id, p.discord_message_id,
             a.status AS approval_status, a.action_at, c.status AS candidate_status,
             (SELECT COUNT(*)::int FROM workflow_events e
               WHERE e.candidate_id = p.candidate_id AND e.event_type = 'PUBLICATION_SUCCEEDED') AS success_events
        FROM published_picks p
        JOIN pick_candidates c ON c.id = p.candidate_id
        LEFT JOIN LATERAL (
          SELECT status, action_at FROM approval_cards
           WHERE candidate_id = p.candidate_id ORDER BY action_at DESC NULLS LAST LIMIT 1
        ) a ON TRUE
       WHERE p.status = 'PUBLISHING' AND p.updated_at < NOW() - INTERVAL '5 minutes'
       ORDER BY p.created_at ASC
       LIMIT 100
    `);
    await client.query('COMMIT');
    const safeRows = rows.map(({ exact_payload: payload, ...row }) => ({
      ...row,
      description_sha256: createHash('sha256').update(String(payload?.embeds?.[0]?.description || '')).digest('hex'),
    }));
    console.log(JSON.stringify({ count: safeRows.length, rows: safeRows }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} catch {
  console.error('Read-only publication inspection failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
