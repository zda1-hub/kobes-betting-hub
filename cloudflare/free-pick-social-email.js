// Approval-triggered emails to Kobe only. No clock-generated or unapproved picks.
const RECIPIENT = 'kobedirwin@gmail.com';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function ensureSocialEmailTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS free_pick_social_emails (
    pick_id TEXT PRIMARY KEY, object_key TEXT NOT NULL, pick_json TEXT NOT NULL,
    discord_url TEXT NOT NULL, created_at TEXT NOT NULL, first_attempt_at TEXT,
    attempt_at TEXT, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','sending','sent','held')),
    provider_message_id TEXT, sent_at TEXT, last_error TEXT
  )`).run();
}
export async function enqueueSocialEmail(request, env, helpers) {
  const {hasBearer, readFreePick, putFreePickObject, phoenixDate, json} = helpers;
  if (!await hasBearer(request, env.FREE_PICK_SITE_PUBLISH_SECRET)) return json({error:'Unauthorized'},401);
  if (!env.DB || !env.RESEND_API_KEY || env.RECAP_NOTIFICATION_RECIPIENT !== RECIPIENT) return json({error:'Kobe social email is not configured'},503);
  let form; try { form = await request.formData(); } catch { return json({error:'Expected multipart form data'},400); }
  const currentPick = await readFreePick(env), pickId = form.get('pickId'), card = form.get('card'), discordUrl = form.get('discordUrl');
  const publishedDate = form.get('publishedDate'), selection = form.get('selection'), odds = form.get('odds');
  const reason = String(form.get('reason') || '').trim();
  if (!/^[A-Za-z0-9_-]{4,160}$/.test(pickId || '') || publishedDate !== phoenixDate()) return json({error:'Only an approved Free Pick from today is eligible'},409);
  if (!selection || !/^[-+]\d{2,4}$/.test(odds || '') || !reason) return json({error:'Approved wager terms and breakdown are required'},400);
  if (pickId === currentPick?.pickId && (selection !== currentPick.details?.selection || odds !== currentPick.details?.odds)) return json({error:'Approved wager terms do not match'},409);
  // The authenticated bot verifies the exact canonical Discord post before it
  // calls this endpoint. Keep each approved pick eligible after a later pick
  // replaces the website's single current-pick slot.
  const pick = pickId === currentPick?.pickId ? currentPick : {
    pickId, publishedDate, details: { selection, odds, reason }
  };
  if (!/^https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+$/.test(discordUrl || '')) return json({error:'A verified Discord post URL is required'},400);
  if (!(card instanceof File) || card.type !== 'image/jpeg' || card.size < 3 || card.size > 5*1024*1024) return json({error:'card must be a JPEG up to 5 MB'},400);
  const bytes = await card.arrayBuffer(), header = new Uint8Array(bytes);
  if (header[0] !== 255 || header[1] !== 216 || header[2] !== 255) return json({error:'Invalid JPEG bytes'},400);
  await ensureSocialEmailTable(env);
  let row = await env.DB.prepare('SELECT status,provider_message_id FROM free_pick_social_emails WHERE pick_id=?').bind(pickId).first();
  if (row) return json({status:row.status, messageId:row.provider_message_id},row.status === 'held' ? 409 : 200);
  const objectKey = `free-picks/social-email/${pickId}-${crypto.randomUUID()}.jpg`;
  await putFreePickObject(env,objectKey,bytes,'image/jpeg','private, no-store');
  await env.DB.prepare(`INSERT OR IGNORE INTO free_pick_social_emails (pick_id,object_key,pick_json,discord_url,created_at) VALUES (?,?,?,?,?)`)
    .bind(pickId,objectKey,JSON.stringify(pick),discordUrl,new Date().toISOString()).run();
  await dispatchSocialEmails(env,helpers);
  row = await env.DB.prepare('SELECT status,provider_message_id FROM free_pick_social_emails WHERE pick_id=?').bind(pickId).first();
  return json({status:row.status,messageId:row.provider_message_id},row.status === 'sent' ? 201 : row.status === 'held' ? 409 : 202);
}
export async function dispatchSocialEmails(env, helpers) {
  if (!env.DB || !env.RESEND_API_KEY || env.RECAP_NOTIFICATION_RECIPIENT !== RECIPIENT) return;
  await ensureSocialEmailTable(env);
  const now = new Date(), cutoff = new Date(+now - 23*3600000).toISOString();
  // Provider idempotency lasts 24 hours. Never blindly retry past that window.
  await env.DB.prepare("UPDATE free_pick_social_emails SET status='held',last_error='VERIFY_PROVIDER_RECEIPT' WHERE status IN ('pending','sending') AND first_attempt_at < ?").bind(cutoff).run();
  await env.DB.prepare("UPDATE free_pick_social_emails SET status='pending' WHERE status='sending' AND attempt_at < ? AND first_attempt_at >= ?")
    .bind(new Date(+now - 10*60000).toISOString(),cutoff).run();
  const {results} = await env.DB.prepare("SELECT * FROM free_pick_social_emails WHERE status='pending' ORDER BY created_at LIMIT 5").all();
  for (const row of results) {
    const pick = JSON.parse(row.pick_json), object = await helpers.getFreePickObject(env,row.object_key);
    if (!object) continue;
    const claim = await env.DB.prepare("UPDATE free_pick_social_emails SET status='sending',attempt_at=?,first_attempt_at=COALESCE(first_attempt_at,?) WHERE pick_id=? AND status='pending'")
      .bind(now.toISOString(),now.toISOString(),row.pick_id).run();
    if (!claim.meta.changes) continue;
    const details = pick.details || {}, term = `${details.selection}${details.odds && !String(details.selection).includes(String(details.odds)) ? ` (${details.odds})` : ''}`;
    const reasons = String(details.reason || '').split(/\s*•\s*/).filter(Boolean);
    const body = `Kobe — your approved Free Pick graphic is ready.\n\n${term}\n${reasons.map(x=>'• '+x).join('\n')}\n\nApproved Discord post: ${row.discord_url}\n\nSave the attached JPEG for posting. 21+ where permitted. Wager responsibly.`;
    const html = `<p>Kobe — your approved Free Pick graphic is ready.</p><p><strong>${escape(term)}</strong></p><ul>${reasons.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><p><a href="${escape(row.discord_url)}">Approved Discord post</a></p><img src="cid:kbh-free-pick" alt="Approved free-pick chat graphic" style="width:100%;max-width:540px;height:auto"><p>Save the attached JPEG for posting. 21+ where permitted. Wager responsibly.</p>`;
    let state='pending', messageId=null, error=null;
    try {
      const bytes = object.body instanceof ArrayBuffer ? object.body : await new Response(object.body).arrayBuffer();
      const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`kbh-social-${row.pick_id}`},
        body:JSON.stringify({from:"Kobe's Betting Hub <support@kobesbettinghub.com>",to:[RECIPIENT],reply_to:'support@kobesbettinghub.com',subject:`Kobe — Free Pick graphic (${pick.publishedDate}, MST)`,text:body,html,
          attachments:[{filename:`KBH-Free-Pick-${row.pick_id}.jpg`,content:helpers.base64FromArrayBuffer(bytes),content_type:'image/jpeg',content_id:'kbh-free-pick'}]}),signal:AbortSignal.timeout(10000)});
      const data = await response.json().catch(()=>({}));
      if (response.ok && data.id) { state='sent';messageId=data.id; }
      else { state=response.status >= 400 && response.status < 500 && response.status !== 429 ? 'held' : 'pending';error=`PROVIDER_${response.status}`; }
    } catch { error='AMBIGUOUS_PROVIDER_RESPONSE'; }
    await env.DB.prepare('UPDATE free_pick_social_emails SET status=?,provider_message_id=?,sent_at=?,last_error=? WHERE pick_id=? AND status=\'sending\'')
      .bind(state,messageId,state==='sent'?new Date().toISOString():null,error,row.pick_id).run();
  }
}
