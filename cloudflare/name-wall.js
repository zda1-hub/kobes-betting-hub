const TIERS = [[25, 'Hood Club'], [10, 'Door Squad'], [3, 'Road Crew'], [1, 'Rider']];
const MILESTONES = [10, 25, 50, 75, 100, 125, 150, 175, 200];
const REQUIRED = ['name_wall_state', 'referral_tiers', 'tier_events', 'name_wall_optout', 'wall_referrals', 'wall_hood_reservations', 'wall_milestones', 'wall_abuse_flags', 'wall_setup_receipts'];
const phoenixDay = value => new Date(Date.parse(value) - 7 * 3600000).toISOString().slice(0, 10);
const REJECT_NAME = /https?:|www\.|discord\.|\b(?:draftkings|fanduel|betmgm|caesars|betrivers|bet365|bitch|fuck|shit|nigg\w*|fagg\w*)\b/i;
const enabled = env => env.NAME_WALL_ENABLED === 'true';
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const safeName = raw => {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name || [...name].length > 20 || /[<>@\r\n\x00-\x1f]/.test(name) || REJECT_NAME.test(name)) throw new Error('Use a clean name of at most 20 characters, with no links or sportsbook names.');
  return name;
};
const tierFor = (count, hoodAvailable = true) => TIERS.find(([minimum, name]) => count >= minimum && (name !== 'Hood Club' || hoodAvailable))?.[1] || 'none';
const qualifies = (row, now = Date.now()) => {
  if (!row.first_paid_at || !row.active || row.canceled || row.refunded || row.disqualified) return false;
  const first = Date.parse(row.first_paid_at);
  if (!Number.isFinite(first)) return false;
  return Boolean(row.second_paid_at && Date.parse(row.second_paid_at) > first) || now - first >= 30 * 86400000;
};
async function schema(db) {
  const rows = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${REQUIRED.map(() => '?').join(',')})`)
    .bind(...REQUIRED).all();
  if (rows.results.length !== REQUIRED.length) throw new Error('Run 002_truck_name_wall.sql before enabling the wall.');
}
async function state(db) { return db.prepare('SELECT * FROM name_wall_state WHERE id=1').first(); }
async function snapshot(db) {
  const current = await state(db);
  if (!current) return { startedAt: null, spot: 0, rows: [] };
  const { results } = await db.prepare(`SELECT t.user_id,t.display_name,t.qualified_count,t.tier,t.joined_at,
    CASE WHEN o.user_id IS NULL THEN 0 ELSE 1 END AS hidden
    FROM referral_tiers t LEFT JOIN name_wall_optout o ON o.user_id=t.user_id
    WHERE t.qualified_count>0 ORDER BY t.qualified_count DESC,t.joined_at ASC`).all();
  return { startedAt: current.started_at, spot: current.active_paid_spots, rows: results.map(r => ({
    name: r.hidden ? 'anonymous rider' : r.display_name, tier: r.tier,
    // Counts are internal; the public page never receives them.
  })) };
}
async function reconcile(db, input, now = new Date()) {
  const current = await state(db);
  if (!current) throw new Error('Wall has not been activated.');
  const started = Date.parse(current.started_at);
  const previousSpot=current.active_paid_spots;
  if (!Number.isInteger(input.activePaidSpots) || input.activePaidSpots < 0 || input.activePaidSpots > 100000) throw new Error('Invalid active paid spot count.');
  const changed = [];
  for (const row of input.referrals || []) {
    if (!/^cus_[A-Za-z0-9]+$/.test(row.customerId || '') || !/^\d{17,20}$/.test(row.referrerId || '') || Date.parse(row.createdAt) < started) continue;
    const old = await db.prepare('SELECT * FROM wall_referrals WHERE customer_id=?').bind(row.customerId).first();
    // The first referred customer owns the attribution forever. Do not count a
    // later subscription or a second referrer for the same customer.
    if (old && (old.referrer_id !== row.referrerId || old.subscription_id !== row.subscriptionId)) continue;
    await db.prepare(`INSERT INTO wall_referrals(customer_id,subscription_id,referrer_id,first_paid_at,second_paid_at,active,canceled,refunded,disqualified,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET first_paid_at=excluded.first_paid_at,
      second_paid_at=excluded.second_paid_at,active=excluded.active,canceled=excluded.canceled,
      refunded=excluded.refunded,updated_at=excluded.updated_at`)
      .bind(row.customerId,row.subscriptionId,row.referrerId,row.firstPaidAt || null,row.secondPaidAt || null,
        Number(Boolean(row.active)),Number(Boolean(row.canceled)),Number(Boolean(row.refunded)),old?.disqualified || 0,now.toISOString()).run();
    changed.push(row.referrerId);
    let displayName='Rider';
    try { displayName=safeName(row.displayName || 'Rider'); } catch { /* untrusted Discord display name */ }
    await db.prepare(`INSERT OR IGNORE INTO referral_tiers(user_id,discord_id,display_name,qualified_count,tier,joined_at,updated_at)
      VALUES(?,?,?,0,'none',?,?)`).bind(row.referrerId,row.referrerId,displayName,now.toISOString(),now.toISOString()).run();
    await db.prepare('UPDATE referral_tiers SET display_name=? WHERE user_id=? AND name_set_at IS NULL')
      .bind(displayName,row.referrerId).run();
  }
  for (const id of new Set(changed)) {
    const existing = await db.prepare('SELECT * FROM referral_tiers WHERE user_id=?').bind(id).first();
    const { results } = await db.prepare('SELECT * FROM wall_referrals WHERE referrer_id=?').bind(id).all();
    const count = results.filter(row => qualifies(row, now.getTime())).length;
    const reservation = await db.prepare('SELECT * FROM wall_hood_reservations WHERE user_id=?').bind(id).first();
    if (count >= 25 && !reservation) {
      const occupied = await db.prepare('SELECT COUNT(*) AS n FROM wall_hood_reservations').first();
      if (occupied.n < 10) await db.prepare('INSERT OR IGNORE INTO wall_hood_reservations VALUES (?,?)').bind(id, now.toISOString()).run();
    }
    if (count < 25 && reservation) await db.prepare('DELETE FROM wall_hood_reservations WHERE user_id=?').bind(id).run();
    const hood = count >= 25 && Boolean(await db.prepare('SELECT 1 FROM wall_hood_reservations WHERE user_id=?').bind(id).first());
    const tier = tierFor(count, hood);
    await db.prepare('UPDATE referral_tiers SET qualified_count=?,tier=?,updated_at=? WHERE user_id=?')
      .bind(count,tier,now.toISOString(),id).run();
    if (tier !== existing.tier) {
      const eventId = `${id}:${existing.tier}:${tier}:${now.toISOString()}`;
      await db.prepare('INSERT OR IGNORE INTO tier_events(id,user_id,from_tier,to_tier,reason,created_at) VALUES(?,?,?,?,?,?)')
        .bind(eventId,id,existing.tier,tier,count > existing.qualified_count ? 'qualified_paid_referral' : 'cancel_or_refund',now.toISOString()).run();
      changed.push({ userId:id, from:existing.tier,to:tier,count,eventId });
    }
  }
  await db.prepare('UPDATE name_wall_state SET active_paid_spots=?,updated_at=? WHERE id=1')
    .bind(input.activePaidSpots,now.toISOString()).run();
  const day = phoenixDay(now.toISOString());
  await db.prepare(`INSERT INTO wall_spot_daily(day,spot,observed_at) VALUES(?,?,?)
    ON CONFLICT(day) DO UPDATE SET spot=excluded.spot,observed_at=excluded.observed_at`)
    .bind(day,input.activePaidSpots,now.toISOString()).run();
  for (const spot of MILESTONES) if (previousSpot < spot && input.activePaidSpots >= spot)
    await db.prepare('INSERT OR IGNORE INTO wall_milestones VALUES(?,?)').bind(spot,now.toISOString()).run();
  const { results: pending } = await db.prepare('SELECT id,user_id,from_tier,to_tier,reason FROM tier_events WHERE notified_at IS NULL').all();
  return { spot: input.activePaidSpots, tierEvents: pending, changed: changed.length };
}
async function handle(request, env) {
  if (!env.DB) return json({ error:'D1 unavailable' },503);
  const url = new URL(request.url);
  if (url.pathname === '/api/truck/wall' && request.method === 'GET') {
    if (!enabled(env)) return json({ spot:0, rows:[] });
    await schema(env.DB);
    const data = await snapshot(env.DB);
    const origin=request.headers.get('origin');
    const headers={'content-type':'application/json','cache-control':'public, max-age=300','vary':'Origin'};
    if (['https://kobesbettinghub.com','https://www.kobesbettinghub.com'].includes(origin)) headers['access-control-allow-origin']=origin;
    return new Response(JSON.stringify(data),{headers});
  }
  if (request.headers.get('authorization') !== `Bearer ${env.ROAD_TO_TRUCK_SECRET}` || !env.ROAD_TO_TRUCK_SECRET) return json({error:'Unauthorized'},401);
  await schema(env.DB);
  if (url.pathname === '/api/admin/truck/state' && request.method === 'GET') return json(await snapshot(env.DB));
  if (!enabled(env)) return json({error:'Name wall is off'},403);
  if (url.pathname === '/api/admin/truck/daily' && request.method === 'GET') {
    const current=await state(env.DB);
    if (!current) return json({error:'Name wall has not been activated'},409);
    const now=new Date();
    const today=phoenixDay(now.toISOString());
    const yesterday=phoenixDay(new Date(now.getTime()-86400000).toISOString());
    const prior=await env.DB.prepare('SELECT spot FROM wall_spot_daily WHERE day=?').bind(yesterday).first();
    const since=new Date(now.getTime()-86400000).toISOString();
    const week=new Date(now.getTime()-7*86400000).toISOString();
    const {results:names}=await env.DB.prepare(`SELECT DISTINCT t.user_id,
      CASE WHEN o.user_id IS NULL THEN t.display_name ELSE 'anonymous rider' END AS name,
      e.created_at FROM tier_events e JOIN referral_tiers t ON t.user_id=e.user_id
      LEFT JOIN name_wall_optout o ON o.user_id=t.user_id
      WHERE e.from_tier='none' AND e.to_tier!='none' AND e.created_at>=? AND t.qualified_count>0
      ORDER BY e.created_at DESC LIMIT 3`).bind(since).all();
    const top=await env.DB.prepare(`SELECT t.user_id,
      CASE WHEN o.user_id IS NULL THEN t.display_name ELSE 'anonymous rider' END AS name,
      COUNT(*) AS n FROM wall_referrals r JOIN referral_tiers t ON t.user_id=r.referrer_id
      LEFT JOIN name_wall_optout o ON o.user_id=t.user_id
      WHERE r.active=1 AND r.canceled=0 AND r.refunded=0 AND r.disqualified=0
      AND ((r.second_paid_at IS NOT NULL AND r.second_paid_at>=? AND datetime(r.second_paid_at)<=datetime('now'))
        OR (r.second_paid_at IS NULL AND datetime(r.first_paid_at,'+30 days')>=datetime(?)
          AND datetime(r.first_paid_at,'+30 days')<=datetime('now')))
      AND t.qualified_count>0 GROUP BY t.user_id ORDER BY n DESC,t.joined_at ASC LIMIT 1`)
      .bind(week,week).first();
    return json({spot:current.active_paid_spots,startedAt:current.started_at,
      verifiedAt:current.updated_at,today,previousSpot:prior?.spot ?? null,
      newNames:names.map(row=>row.name),topRef:top?.name || null});
  }
  if (url.pathname === '/api/admin/truck/activate' && request.method === 'POST') {
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT OR IGNORE INTO name_wall_state VALUES(1,?,0,?)').bind(now,now).run();
    return json(await state(env.DB));
  }
  if (url.pathname === '/api/admin/truck/sync' && request.method === 'POST') {
    const body = await request.json();
    return json(await reconcile(env.DB,body));
  }
  if (url.pathname === '/api/admin/truck/ack' && request.method === 'POST') {
    const body = await request.json();
    if (typeof body.eventId !== 'string' || body.eventId.length > 150) return json({error:'Invalid event'},400);
    await env.DB.prepare('UPDATE tier_events SET notified_at=? WHERE id=? AND notified_at IS NULL')
      .bind(new Date().toISOString(),body.eventId).run();
    return json({ok:true});
  }
  if (url.pathname === '/api/admin/truck/pending' && request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT id,user_id,from_tier,to_tier,reason FROM tier_events WHERE notified_at IS NULL ORDER BY created_at LIMIT 50').all();
    return json({events:results});
  }
  if (url.pathname === '/api/admin/truck/leaderboard' && request.method === 'GET') {
    const {results} = await env.DB.prepare(`SELECT t.user_id,t.qualified_count,t.tier,
      CASE WHEN o.user_id IS NULL THEN t.display_name ELSE 'anonymous rider' END AS name
      FROM referral_tiers t LEFT JOIN name_wall_optout o ON o.user_id=t.user_id
      WHERE t.qualified_count>0 ORDER BY t.qualified_count DESC,t.joined_at ASC LIMIT 10`).all();
    return json({spot:(await state(env.DB))?.active_paid_spots||0,rows:results});
  }
  if (url.pathname === '/api/admin/truck/milestones' && request.method === 'GET') {
    const cutoff=new Date(Date.now()-2*3600000).toISOString();
    const {results}=await env.DB.prepare('SELECT spot,claimed_at FROM wall_milestones WHERE claimed_at>=? ORDER BY spot')
      .bind(cutoff).all();
    return json({milestones:results});
  }
  if (url.pathname === '/api/admin/truck/receipt' && request.method === 'POST') {
    const body = await request.json();
    if (!/^[a-z0-9:-]{3,100}$/.test(body.id || '')) return json({error:'Invalid receipt ID'},400);
    const result = await env.DB.prepare('INSERT OR IGNORE INTO wall_setup_receipts VALUES(?,?,?)')
      .bind(body.id,String(body.value || '').slice(0,500),new Date().toISOString()).run();
    return json({claimed:Boolean(result.meta.changes)});
  }
  if (url.pathname === '/api/admin/truck/receipt' && request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!/^[a-z0-9:-]{3,100}$/.test(id || '')) return json({error:'Invalid receipt ID'},400);
    return json({receipt:await env.DB.prepare('SELECT * FROM wall_setup_receipts WHERE id=?').bind(id).first()});
  }
  if (url.pathname === '/api/admin/truck/flag' && request.method === 'POST') {
    const body=await request.json();
    if (!/^[a-z0-9:-]{3,150}$/.test(body.id||'') || !/^\d{17,20}$/.test(body.referrerId||'') ||
      !/^[a-z_]{3,50}$/.test(body.reason||'')) return json({error:'Invalid flag'},400);
    const result=await env.DB.prepare('INSERT OR IGNORE INTO wall_abuse_flags VALUES(?,?,?,?,?)')
      .bind(body.id,body.referrerId,body.customerId||null,body.reason,new Date().toISOString()).run();
    return json({created:Boolean(result.meta.changes)});
  }
  if (url.pathname === '/api/admin/truck/user' && request.method === 'POST') {
    const body = await request.json();
    if (!/^\d{17,20}$/.test(body.userId || '')) return json({error:'Invalid user'},400);
    let user = await env.DB.prepare('SELECT * FROM referral_tiers WHERE user_id=?').bind(body.userId).first();
    if (body.action === 'get') return json({ count:user?.qualified_count || 0,tier:user?.tier || 'none',name:user?.display_name || null });
    if (!user && ['name','hide','show'].includes(body.action)) {
      // Members may prepare their public name and visibility before earning a tier.
      if (body.action === 'name') safeName(body.name);
      const now=new Date().toISOString();
      await env.DB.prepare(`INSERT OR IGNORE INTO referral_tiers(user_id,discord_id,display_name,qualified_count,tier,joined_at,updated_at)
        VALUES(?,?,?,0,'none',?,?)`).bind(body.userId,body.userId,'Rider',now,now).run();
      user=await env.DB.prepare('SELECT * FROM referral_tiers WHERE user_id=?').bind(body.userId).first();
    }
    if (!user) return json({error:'Invalid action'},400);
    if (body.action === 'name') {
      if (user.name_set_at) return json({error:'Name already set'},409);
      const name = safeName(body.name);
      await env.DB.prepare('UPDATE referral_tiers SET display_name=?,name_set_at=? WHERE user_id=? AND name_set_at IS NULL')
        .bind(name,new Date().toISOString(),body.userId).run();
    } else if (body.action === 'hide') await env.DB.prepare('INSERT OR IGNORE INTO name_wall_optout VALUES(?)').bind(body.userId).run();
    else if (body.action === 'show') await env.DB.prepare('DELETE FROM name_wall_optout WHERE user_id=?').bind(body.userId).run();
    else return json({error:'Invalid action'},400);
    return json({ok:true});
  }
  if (url.pathname === '/api/admin/truck/remove' && request.method === 'POST') {
    const body = await request.json();
    if (!/^\d{17,20}$/.test(body.userId || '') || !String(body.reason || '').trim()) return json({error:'User and reason required'},400);
    await env.DB.prepare('UPDATE wall_referrals SET disqualified=1 WHERE referrer_id=?').bind(body.userId).run();
    const user = await env.DB.prepare('SELECT * FROM referral_tiers WHERE user_id=?').bind(body.userId).first();
    if (user) {
      await env.DB.prepare("UPDATE referral_tiers SET qualified_count=0,tier='none',updated_at=? WHERE user_id=?")
        .bind(new Date().toISOString(),body.userId).run();
      await env.DB.prepare('INSERT INTO tier_events(id,user_id,from_tier,to_tier,reason,created_at) VALUES(?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),body.userId,user.tier,'none',String(body.reason).slice(0,200),new Date().toISOString()).run();
    }
    return json({ok:true});
  }
  return json({error:'Not found'},404);
}
export { handle, qualifies, tierFor, safeName, MILESTONES, snapshot, reconcile };
