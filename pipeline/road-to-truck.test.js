const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { queue, schedule, due, validateItem, forbidden, dayNumber, mstStamp } = require('./road-to-truck-schedule');
const { renderCard, renderDailyCard } = require('./road-to-truck-card');
const { run, paidLeaderboard, enabled, processItem, postDaily } = require('./run-road-to-truck');
const { buildDaily, dayFromLaunch } = require('./truck-daily');

test('active X templates fit after verified substitution; retired copy cannot pass', () => {
  for (const item of queue.filter(row => row.platform === 'x' && row.recurrence === 'referral_template')) {
    const text=item.text.replace('{X}','200');
    const rendered=validateItem({...item,text}, '26-17');
    assert.ok(rendered.text.length <= 280,item.id);
    assert.ok(rendered.first_reply.length <= 280,item.id);
  }
  for (const item of queue.filter(row => row.platform === 'x' && row.id.startsWith('truck-day-'))) {
    // Earlier static 6 PM copy is retained for history but never scheduled.
    assert.ok(!schedule('2026-11-19',7).some(row=>row.id===item.id));
  }
  for (const item of queue.filter(row => row.platform === 'x' && row.recurrence === 'daily_caption')) {
    const text=item.text.replaceAll('{day}','1').replaceAll('{X}','200').replaceAll('{new_names}','A').replaceAll('{top_ref}','A');
    const rendered=validateItem({...item,text},'26-17');
    assert.ok(rendered.text.length <= 280,item.id);
  }
});
test('compliance blocks risky terms and missing age notice', () => {
  for (const word of ['lock', 'guaranteed', 'profit', 'parlay', 'DraftKings']) assert.ok(forbidden(`21+ ${word}`), word);
  assert.equal(forbidden('free picks available'), 'missing 21+');
  assert.equal(forbidden('21+ | not a guarantee'), null);
});
test('MST times map to UTC without DST and day numbers include Nov 19, Nov 25, Dec 10', () => {
  assert.equal(new Date(mstStamp('2026-11-19', 18)).toISOString(), '2026-11-20T01:00:00.000Z');
  assert.equal(dayNumber('2026-11-19'), 1);
  assert.equal(dayNumber('2026-11-25'), 7);
  assert.equal(dayNumber('2026-12-10'), 22);
});
test('daily series extends beyond day seven and recurring referral source does not repeat within 14 days', () => {
  const items = schedule('2026-11-19', 40);
  assert.equal(items.find(item => item.id === 'truck-daily-2026-12-10').scheduled_at, mstStamp('2026-12-10', 10));
  const recurring = items.filter(item => item.sourceId);
  assert.ok(recurring.length >= 8);
  for (let i = 0; i < recurring.length; i++) for (let j = i + 1; j < recurring.length; j++) {
    if (recurring[i].sourceId === recurring[j].sourceId) {
      assert.ok(Date.parse(recurring[j].scheduled_at) - Date.parse(recurring[i].scheduled_at) >= 14 * 86400000);
    }
  }
});
test('kill switch stops everything and due selector refuses older than two hours', async () => {
  assert.equal(enabled({ ROAD_TO_TRUCK_ENABLED: 'false' }), false);
  const scheduled = { ROAD_TO_TRUCK_ENABLED: 'true', ROAD_TO_TRUCK_START_AT: '2026-11-19T19:15:00Z' };
  assert.equal(enabled(scheduled, new Date('2026-11-19T19:14:59Z')), false);
  assert.equal(enabled(scheduled, new Date('2026-11-19T19:15:00Z')), true);
  assert.equal(enabled({ ...scheduled, ROAD_TO_TRUCK_ENABLED: 'false' }, new Date('2026-11-20T17:00:00Z')), false);
  assert.equal(enabled({ ROAD_TO_TRUCK_ENABLED: 'true', ROAD_TO_TRUCK_START_AT: 'invalid' }), false);
  assert.equal((await run({ env: { ROAD_TO_TRUCK_ENABLED: 'false' }, now: new Date('2026-11-19T19:00:00Z') })).status, 'disabled');
  const items = schedule('2026-11-19', 1);
  assert.ok(!items.some(item=>item.daily));
  const friday=schedule('2026-11-20',1);
  const tick=due(friday,new Date('2026-11-20T19:01:00Z'),true);
  assert.ok(tick.expired.some(item=>item.id==='truck-daily-2026-11-20'));
  assert.ok(!tick.ready.some(item=>item.id==='truck-daily-2026-11-20'));
  assert.deepEqual(due(friday,new Date('2026-11-20T17:01:00Z'),false),{ready:[],expired:[]});
});
test('switch on dispatches a due Discord item without any approval step', async () => {
  const calls = [];
  const env = { ROAD_TO_TRUCK_ENABLED: 'true', TRUCK_PUBLISHER_URL: 'https://publisher.test',
    ROAD_TO_TRUCK_SECRET: 'test', TRUCK_ASSET_URL: 'https://assets.test', TRUCK_ASSET_SECRET: 'test',
    DISCORD_TOKEN: 'test', AUDIT_CHANNEL_ID: '123456789012345678' };
  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname;
    calls.push(`${options.method || 'GET'} ${route}`);
    const json = route.endsWith('/record') ? { record: '26-17' }
      : route.endsWith('/claim') ? { status: 'claimed' }
      : route.endsWith('/complete') ? { status: 'posted' }
      : route === '/api/v10/channels/1276995106779693088'
        ? { id: '1276995106779693088', guild_id: '1215407647155683358', type: 0, name: '💬・community-chat' }
        : route === '/api/v10/channels/123456789012345678'
          ? { id: '123456789012345678', guild_id: '1215407647155683358', type: 0,
            permission_overwrites: [{ id: '1215407647155683358', type: 0, deny: String(1 << 10) }] }
          : { id: '123456789012345679' };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await processItem(env,queue.find(row=>row.id==='truck-discord-pin'),'26-17',{fetchImpl});
  assert.equal(result.status,'posted');
  assert.ok(calls.includes('POST /api/v10/channels/1276995106779693088/messages'));
  assert.ok(calls.includes('POST /api/v10/channels/123456789012345678/messages'));
});
test('leaderboard skips a week with zero paid referrals', async () => {
  const item = schedule('2026-11-23', 1).find(row => row.week);
  const result = await paidLeaderboard({}, item, { database: { query: async () => ({ rows: [] }) } });
  assert.equal(result, null);
});
test('card renders with and without photo at 1080x1350 without cropped text', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-truck-test-'));
  try {
    const noPhoto = await renderCard({ date: '2026-11-19', photoPath: path.join(temp, 'missing.jpg'), outputPath: path.join(temp, 'solid.png') });
    assert.equal(noPhoto.day, 1); assert.equal(noPhoto.hasPhoto, false);
    assert.deepEqual((({ width, height }) => ({ width, height }))(await sharp(noPhoto.png).metadata()), { width: 1080, height: 1350 });
    const fixture = path.join(temp, 'photo.jpg');
    await sharp({ create: { width: 500, height: 800, channels: 3, background: '#727a85' } }).jpeg().toFile(fixture);
    const withPhoto = await renderCard({ date: '2026-12-10', record: '100-100', photoPath: fixture, outputPath: path.join(temp, 'photo.png') });
    assert.equal(withPhoto.day, 22); assert.equal(withPhoto.hasPhoto, true);
    assert.deepEqual((({ width, height }) => ({ width, height }))(await sharp(withPhoto.png).metadata()), { width: 1080, height: 1350 });
    assert.ok(withPhoto.png.length > 20000);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('daily card requires the credited real photo and uses the launch day',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'kbh-truck-daily-'));
  try {
    await assert.rejects(()=>renderDailyCard({day:1,spot:0,photoPath:path.join(temp,'missing.jpg')}),/ENOENT/);
    const card=await renderDailyCard({day:2,spot:7,newNames:['Rider One'],topRef:'Rider One'});
    assert.equal(card.spot,7);
    assert.equal(card.day,2);
    assert.equal((await sharp(card.png).metadata()).width,1080);
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
});
test('daily caption uses no-name fallback and neutral copy when spot falls',()=>{
  const base={spot:0,startedAt:'2026-11-18T17:00:00Z',verifiedAt:'2026-11-20T17:00:00Z',newNames:[],topRef:null};
  assert.equal(dayFromLaunch(base.startedAt,'2026-11-19'),1);
  assert.equal(dayFromLaunch(base.startedAt,'2026-11-20'),2);
  assert.equal(dayFromLaunch(base.startedAt,'2026-11-21'),3);
  const empty=buildDaily(base,'2026-11-20');
  assert.equal(empty.day,2);
  assert.match(empty.text,/who's first on the wall/);
  assert.equal(empty.sourceId,'truck-daily-empty-wall');
  assert.doesNotMatch(empty.text,/https?:\/\//);
  const later=buildDaily({...base,spot:7},'2026-11-20');
  assert.match(later.text,/who's next on the wall/);
  assert.equal(later.sourceId,'truck-daily-no-names');
  const down=buildDaily({...base,spot:7,previousSpot:8},'2026-11-20');
  assert.equal(down.neutral,true);
  assert.match(down.text,/lower than yesterday/);
});
test('daily dry run makes no external writes',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push(options.method||'GET');
    return Response.json({spot:0,startedAt:'2026-11-19T17:00:00Z',verifiedAt:'2026-11-20T17:00:00Z',previousSpot:0,newNames:[],topRef:null});
  };
  const result=await run({env:{TRUCK_PUBLISHER_URL:'https://publisher.test',ROAD_TO_TRUCK_SECRET:'test'},
    now:new Date('2026-11-20T17:00:00Z'),fetchImpl,dryRun:true});
  assert.equal(result.externalWrites,0);
  assert.match(result.output,/First scheduled card \(2026-11-21 10:00 MST\)/);
  assert.match(result.output,/who's first on the wall\?/);
  assert.deepEqual(calls,['GET']);
  assert.ok(result.imagePath);
  await fs.rm(result.imagePath,{force:true});
});
test('daily path sends one verified image to X and the truck wall and edits the guide',async()=>{
  const calls=[];
  const now=new Date().toISOString();
  const env={TRUCK_PUBLISHER_URL:'https://publisher.test',ROAD_TO_TRUCK_SECRET:'test',
    TRUCK_ASSET_URL:'https://assets.test',TRUCK_ASSET_SECRET:'test',DISCORD_TOKEN:'test',
    AUDIT_CHANNEL_ID:'123456789012345678'};
  const channels=[
    {id:'111111111111111111',name:'🛻 ROAD TO THE TRUCK',type:4},
    {id:'222222222222222222',name:'truck-wall',type:0,parent_id:'111111111111111111'},
    {id:'333333333333333333',name:'how-to-get-on-the-truck',type:0,parent_id:'111111111111111111'},
  ];
  const fetchImpl=async(url,options={})=>{
    const route=new URL(url).pathname,method=options.method||'GET';
    calls.push(`${method} ${route}`);
    const body=route.endsWith('/daily')?{spot:3,previousSpot:3,startedAt:'2026-11-18T17:00:00Z',
      verifiedAt:now,newNames:['Rider One'],topRef:'Rider One'}
      :route.includes('/receipt')&&method==='GET'?{receipt:null}
      :route.includes('/receipt')?{claimed:true}
      :route==='/api/v10/guilds/1215407647155683358/channels'?channels
      :route==='/api/v10/channels/333333333333333333/pins'?[{id:'444444444444444444',author:{id:'555555555555555555'},embeds:[{footer:{text:'KBH truck wall explainer • managed by Kobe Bot'}}]}]
      :route==='/api/v10/users/@me'?{id:'555555555555555555'}
      :route==='/api/v10/channels/123456789012345678'?{id:'123456789012345678',guild_id:'1215407647155683358',type:0,
        permission_overwrites:[{id:'1215407647155683358',type:0,deny:'1024'}]}
      :route.endsWith('/claim')?{status:'claimed'}
      :route.endsWith('/complete')?{status:'posted'}
      :route.endsWith('/x')?{status:'posted',post_id:'666666666666666666',reply_post_id:'777777777777777777'}
      :{id:'888888888888888888'};
    return Response.json(body);
  };
  const result=await postDaily(env,{scheduled_at:'2026-11-19T10:00:00-07:00'},fetchImpl);
  assert.equal(result.status,'posted');
  assert.ok(calls.includes('POST /api/admin/road-to-truck/x'));
  assert.ok(calls.includes('POST /api/v10/channels/222222222222222222/messages'));
  assert.ok(calls.includes('PATCH /api/v10/channels/333333333333333333/messages/444444444444444444'));
  assert.ok(calls.includes('PUT /assets/road_to_truck/daily-2026-11-19.png'));
});
