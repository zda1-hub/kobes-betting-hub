const TABLE = `CREATE TABLE IF NOT EXISTS posted_log (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK (platform IN ('x','discord')),
  post_id TEXT, posted_at TEXT, status TEXT NOT NULL DEFAULT 'claimed',
  reply_post_id TEXT, detail TEXT, claimed_at TEXT NOT NULL)`;
const VALID_ID = /^truck-[a-z0-9-]{3,90}$/;
const BOOKS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'BetRivers', 'ESPN BET', 'Hard Rock Bet', 'Fanatics Sportsbook', 'bet365'];
const response = (body, status = 200) => Response.json(body, { status });
const has21 = value => /21\s*\+/.test(value);

function compliance(text, platform, firstReply = false) {
  if (typeof text !== 'string' || !text.trim()) return 'Empty text';
  if (!has21(text)) return 'Missing 21+';
  if (/\b(?:lock|guaranteed|profit|parlay)\b|\b\d+(?:\.\d+)?\s*(?:units?|u)\b|\$/i.test(text)) return 'Blocked claim';
  if (!firstReply && !/not a guarantee/i.test(text)) return 'Missing no-guarantee footer';
  if (!firstReply && /\bmembers\b/i.test(text)) return 'Blocked public count term';
  if (BOOKS.some(book => new RegExp(`\\b${book.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').test(text))) return 'Sportsbook name';
  if (platform === 'x' && text.length > 280) return 'X text exceeds 280 characters';
  return null;
}

async function ensure(db) { await db.prepare(TABLE).run(); }
async function claim(db, id, platform, status = 'claimed', detail = null) {
  const receipt = await db.prepare('INSERT OR IGNORE INTO posted_log (id,platform,status,detail,claimed_at) VALUES (?,?,?,?,?)')
    .bind(id, platform, status, detail, new Date().toISOString()).run();
  return Number(receipt.meta.changes) === 1;
}
async function readRecord(db) {
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='graded_free_picks'").first();
  if (exists) {
    try {
      const { results } = await db.prepare("SELECT result, COUNT(DISTINCT pick_id) AS n FROM graded_free_picks WHERE operating_date >= '2026-09-22' AND result_verified_at IS NOT NULL AND result IN ('W','L') GROUP BY result").all();
      const wins = Number(results.find(row => row.result === 'W')?.n || 0);
      const losses = Number(results.find(row => row.result === 'L')?.n || 0);
      if (wins + losses > 0) return { record: `${wins}-${losses}`, source: 'graded_free_picks', warning: null };
    } catch (error) { console.warn('Truck record: graded D1 table could not be reconciled', error.message); }
  }
  console.warn('Truck record: no trusted graded free-pick D1 record; using verified fallback 26-17.');
  return { record: '26-17', source: 'verified_fallback', warning: 'No trusted graded free-pick D1 record; using 26-17.' };
}

export async function roadToTruck(request, env, { postX } = {}) {
  if (!env.DB) return response({ error: 'D1 unavailable' }, 503);
  await ensure(env.DB);
  const action = new URL(request.url).pathname.split('/').at(-1);
  if (action === 'record' && request.method === 'GET') return response(await readRecord(env.DB));
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => null);
  if (!body || !VALID_ID.test(body.id || '') || !['x','discord'].includes(body.platform)) return response({ error: 'Invalid truck item' }, 400);
  if (action === 'skip') {
    const saved = await claim(env.DB, body.id, body.platform, 'skipped', String(body.reason || 'expired').slice(0, 200));
    return response({ status: saved ? 'skipped' : 'already_handled' });
  }
  if (action === 'claim' && body.platform === 'discord') {
    const error = compliance(body.text, 'discord');
    if (error) return response({ error }, 422);
    const saved = await claim(env.DB, body.id, 'discord');
    return response({ status: saved ? 'claimed' : 'already_handled' });
  }
  if (action === 'complete' && body.platform === 'discord') {
    if (!/^\d{10,25}$/.test(body.post_id || '')) return response({ error: 'Invalid Discord post ID' }, 400);
    const done = await env.DB.prepare("UPDATE posted_log SET post_id=?,posted_at=?,status='posted' WHERE id=? AND platform='discord' AND status='claimed'")
      .bind(body.post_id, new Date().toISOString(), body.id).run();
    return response({ status: done.meta.changes ? 'posted' : 'already_handled' });
  }
  if (action === 'x' && body.platform === 'x') {
    const error = compliance(body.text, 'x') || compliance(body.first_reply, 'x', true);
    if (error) return response({ error }, 422);
    if (body.image_base64 && (!/^[A-Za-z0-9+/=]+$/.test(body.image_base64) || body.image_base64.length > 8_000_000))
      return response({ error: 'Invalid image' }, 422);
    const saved = await claim(env.DB, body.id, 'x');
    if (!saved) {
      const row = await env.DB.prepare('SELECT post_id,status,reply_post_id FROM posted_log WHERE id=?').bind(body.id).first();
      return response({ status: 'already_handled', post_id: row?.post_id || null, reply_post_id: row?.reply_post_id || null });
    }
    if (!postX) return response({ error: 'X poster unavailable' }, 503);
    let parent = null;
    try {
      parent = await postX(body.text, null, body.image_base64 || null);
      await env.DB.prepare("UPDATE posted_log SET post_id=?,posted_at=?,status='parent_posted' WHERE id=? AND status='claimed'")
        .bind(parent, new Date().toISOString(), body.id).run();
      const reply = await postX(body.first_reply, parent, null);
      await env.DB.prepare("UPDATE posted_log SET reply_post_id=?,status='posted' WHERE id=? AND status='parent_posted'")
        .bind(reply, body.id).run();
      return response({ status: 'posted', post_id: parent, reply_post_id: reply });
    } catch (error) {
      await env.DB.prepare("UPDATE posted_log SET status=?,detail=? WHERE id=?")
        .bind(parent ? 'partial' : 'held', String(error.message || error).slice(0, 400), body.id).run();
      console.error('Truck X post held:', body.id, error.message);
      return response({ error: 'X post held for review', post_id: parent, status: parent ? 'partial' : 'held' }, 502);
    }
  }
  return response({ error: 'Invalid action' }, 400);
}

export const __test = { compliance, readRecord, claim };
