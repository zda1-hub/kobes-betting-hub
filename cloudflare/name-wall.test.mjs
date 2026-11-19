import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle,qualifies,tierFor,safeName,reconcile,snapshot} from './name-wall.js';

function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations/002_truck_name_wall.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('./migrations/003_truck_daily.sql',import.meta.url),'utf8'));
  const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},
    async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}},
    async first(){return sqlite.prepare(sql).get(...args)||null},
    async all(){return {results:sqlite.prepare(sql).all(...args)}}});
  return {prepare:sql=>wrap(sql),sqlite,close:()=>sqlite.close()};
}
const start='2026-11-19T01:00:00.000Z';
const now=new Date('2026-12-21T01:00:00.000Z');
const row=(id='cus_abc')=>({customerId:id,subscriptionId:'sub_abc',referrerId:'123456789012345678',
  createdAt:'2026-11-19T02:00:00.000Z',firstPaidAt:'2026-11-20T00:00:00.000Z',secondPaidAt:null,
  active:true,canceled:false,refunded:false,displayName:'Example Rider'});

test('wall starts empty, ignores historical referrals, and requires a paid month',async()=>{
  const db=database();await db.prepare('INSERT INTO name_wall_state VALUES(1,?,0,?)').bind(start,start).run();
  assert.deepEqual(await snapshot(db),{startedAt:start,spot:0,rows:[]});
  const old={...row('cus_old'),createdAt:'2026-11-18T23:00:00.000Z'};
  await reconcile(db,{activePaidSpots:0,referrals:[old]},now);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM wall_referrals').get().n,0);
  const fresh=row();await reconcile(db,{activePaidSpots:1,referrals:[fresh]},new Date('2026-11-25T00:00:00Z'));
  assert.equal((await snapshot(db)).rows.length,0);
  await reconcile(db,{activePaidSpots:1,referrals:[fresh]},now);
  assert.deepEqual((await snapshot(db)).rows,[{name:'Example Rider',tier:'Rider'}]);db.close();
});
test('second payment qualifies, repeat is idempotent, cancellation demotes',async()=>{
  const db=database();await db.prepare('INSERT INTO name_wall_state VALUES(1,?,0,?)').bind(start,start).run();
  const paid={...row(),secondPaidAt:'2026-12-19T00:00:00.000Z'};
  await reconcile(db,{activePaidSpots:1,referrals:[paid]},now);
  await reconcile(db,{activePaidSpots:1,referrals:[paid]},now);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM wall_referrals').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tier_events').get().n,1);
  await reconcile(db,{activePaidSpots:0,referrals:[{...paid,active:false,canceled:true}]},now);
  assert.equal(db.sqlite.prepare('SELECT tier FROM referral_tiers').get().tier,'none');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tier_events').get().n,2);db.close();
});
test('refunds and duplicate customer attribution never count twice',async()=>{
  const db=database();await db.prepare('INSERT INTO name_wall_state VALUES(1,?,0,?)').bind(start,start).run();
  const first={...row(),secondPaidAt:'2026-12-19T00:00:00.000Z',refunded:true};
  await reconcile(db,{activePaidSpots:0,referrals:[first]},now);
  await reconcile(db,{activePaidSpots:0,referrals:[{...first,refunded:false,referrerId:'999999999999999999'}]},now);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM wall_referrals').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT referrer_id FROM wall_referrals').get().referrer_id,first.referrerId);
  assert.equal(db.sqlite.prepare('SELECT tier FROM referral_tiers').get().tier,'none');db.close();
});
test('names are filtered; disabled API makes no writes; hood cap maps waitlist to Door Squad',async()=>{
  assert.equal(tierFor(25,false),'Door Squad');assert.equal(tierFor(25,true),'Hood Club');
  assert.throws(()=>safeName('https://example.com'));assert.throws(()=>safeName('DraftKings'));
  const db=database();const response=await handle(new Request('https://example.test/api/admin/truck/activate',{method:'POST',headers:{authorization:'Bearer abc'}}),
    {DB:db,ROAD_TO_TRUCK_SECRET:'abc',NAME_WALL_ENABLED:'false'});
  assert.equal(response.status,403);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM name_wall_state').get().n,0);db.close();
});
test('30-day rule excludes DNP-style unpaid states, cancellation and refund',()=>{
  const paid={first_paid_at:row().firstPaidAt,second_paid_at:null,active:true,canceled:false,refunded:false,disqualified:false};
  assert.equal(qualifies(paid,now.getTime()),true);
  assert.equal(qualifies({...paid,first_paid_at:null},now.getTime()),false);
  assert.equal(qualifies({...paid,active:false},now.getTime()),false);
  assert.equal(qualifies({...paid,refunded:true},now.getTime()),false);
});
test('daily snapshot uses verified spot, prior day, and hidden names',async()=>{
  const db=database();
  const current=new Date(), yesterday=new Date(current.getTime()-86400000);
  const priorDay=new Date(yesterday.getTime()-7*3600000).toISOString().slice(0,10);
  await db.prepare('INSERT INTO name_wall_state VALUES(1,?,?,?)').bind(start,7,current.toISOString()).run();
  await db.prepare('INSERT INTO wall_spot_daily VALUES(?,?,?)').bind(priorDay,8,yesterday.toISOString()).run();
  await db.prepare("INSERT INTO referral_tiers(user_id,discord_id,display_name,qualified_count,tier,joined_at,updated_at) VALUES(?,?,?,1,'Rider',?,?)")
    .bind('123456789012345678','123456789012345678','Private Name',start,current.toISOString()).run();
  await db.prepare('INSERT INTO name_wall_optout VALUES(?)').bind('123456789012345678').run();
  await db.prepare('INSERT INTO tier_events(id,user_id,from_tier,to_tier,reason,created_at) VALUES(?,?,?,?,?,?)')
    .bind('evt1','123456789012345678','none','Rider','qualified_paid_referral',current.toISOString()).run();
  const res=await handle(new Request('https://example.test/api/admin/truck/daily',{headers:{authorization:'Bearer test'}}),
    {DB:db,ROAD_TO_TRUCK_SECRET:'test',NAME_WALL_ENABLED:'true'});
  const body=await res.json();
  assert.equal(body.spot,7);assert.equal(body.previousSpot,8);
  assert.deepEqual(body.newNames,['anonymous rider']);db.close();
});
