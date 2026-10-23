import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { operationCheckConfig } from './check-membership-operations.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const guildId = '1215407647155683358';
const botId = '1539103276107046955';
const allowedChannels = new Set(['1539055850075852911', '1557117816228806786']);

function receiptManifest() {
  if (process.env.APPLY_PUBLICATION_RECONCILIATION !== 'true') throw new Error('Explicit reconciliation switch is required.');
  const raw = Buffer.from(String(process.env.RECEIPTS_B64 || ''), 'base64').toString('utf8');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length !== 65) throw new Error('Expected exactly 65 inspected receipts.');
  const seenPicks = new Set();
  const seenMessages = new Set();
  for (const row of rows) {
    if (!/^(?:\d{8}-\d+-X|tg-\d{8}-\d+-\d+)$/.test(row.pick_id)
      || !allowedChannels.has(row.channel_id)
      || !/^\d{15,20}$/.test(row.message_id)
      || row.author_id !== botId
      || !/^[a-f0-9]{64}$/.test(row.description_sha256)
      || !Number.isFinite(Date.parse(row.created_at))
      || !Number.isFinite(Date.parse(row.timestamp))
      || Date.parse(row.timestamp) - Date.parse(row.created_at) < 0
      || Date.parse(row.timestamp) - Date.parse(row.created_at) > 10_000
      || seenPicks.has(row.pick_id) || seenMessages.has(row.message_id)) {
      throw new Error('Receipt manifest failed its identity, timing, or uniqueness guard.');
    }
    seenPicks.add(row.pick_id);
    seenMessages.add(row.message_id);
  }
  return rows;
}

const rows = receiptManifest();
const { databaseUrl } = operationCheckConfig();
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    for (const receipt of rows) {
      const { rows: matches } = await client.query(`
        SELECT p.id, p.candidate_id, p.created_at, p.exact_payload,
               p.discord_message_id, p.post_reference, a.id AS approval_id,
               c.status AS candidate_status
          FROM published_picks p
          JOIN approval_cards a ON a.candidate_id = p.candidate_id
          JOIN pick_candidates c ON c.id = p.candidate_id
         WHERE p.pick_id = $1 AND p.status = 'PUBLISHING'
           AND a.status = 'APPROVED_PENDING_PUBLICATION'
         FOR UPDATE OF p, a, c`, [receipt.pick_id]);
      if (matches.length !== 1) throw new Error('A publication or approval changed during reconciliation.');
      const row = matches[0];
      const digest = createHash('sha256').update(String(row.exact_payload?.embeds?.[0]?.description || '')).digest('hex');
      if (digest !== receipt.description_sha256
        || new Date(row.created_at).toISOString() !== new Date(receipt.created_at).toISOString()
        || row.discord_message_id || row.post_reference || row.candidate_status !== 'PUBLISHING') {
        throw new Error('A publication failed its stored-content or state guard.');
      }
      const reference = `https://discord.com/channels/${guildId}/${receipt.channel_id}/${receipt.message_id}`;
      await client.query(`UPDATE published_picks SET status='PUBLISHED', discord_channel_id=$2,
        discord_message_id=$3, post_reference=$4, published_at=$5::timestamptz,
        error_detail=NULL, updated_at=NOW() WHERE id=$1`,
      [row.id, receipt.channel_id, receipt.message_id, reference, receipt.timestamp]);
      await client.query("UPDATE approval_cards SET status='PUBLISHED' WHERE id=$1", [row.approval_id]);
      await client.query("UPDATE pick_candidates SET status='PUBLISHED', updated_at=NOW() WHERE id=$1", [row.candidate_id]);
      await client.query(`INSERT INTO workflow_events
        (id, source_post_id, candidate_id, event_type, actor_type, actor_id,
         before_state, after_state, details, occurred_at)
        SELECT $1, source_post_id, id, 'PUBLICATION_RECONCILED', 'system',
               'discord_exact_receipt_audit', 'PUBLISHING', 'PUBLISHED', $3::jsonb, NOW()
          FROM pick_candidates WHERE id=$2`,
      [randomUUID(), row.candidate_id, JSON.stringify({ pick_id: receipt.pick_id, discord_channel_id: receipt.channel_id, discord_message_id: receipt.message_id, receipt_timestamp: receipt.timestamp, description_sha256: digest })]);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ reconciled: rows.length, discordPostsCreated: 0 }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} catch {
  console.error('Publication reconciliation aborted and rolled back. No receipt details were logged.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
