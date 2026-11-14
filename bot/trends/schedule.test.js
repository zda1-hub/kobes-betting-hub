const test=require('node:test'); const assert=require('node:assert/strict');
const {dailyPlan,belongsToServiceDate}=require('./schedule');
test('confirmed Pacific midnight uses upcoming local day, remains disabled',()=>{const p=dailyPlan({now:'2026-11-15T08:00:00Z'});assert.equal(p.serviceDate,'2026-11-15');assert.equal(p.atMidnight,true);assert.equal(p.enabled,false);assert.equal(p.publicationAllowed,false);assert.equal(p.timeZoneConfirmed,true)});
test('before midnight is previous service day',()=>{assert.equal(dailyPlan({now:'2026-11-15T07:59:00Z'}).serviceDate,'2026-11-14')});
test('DST midnight differs from standard-time UTC hour',()=>{assert.equal(dailyPlan({now:'2026-07-15T07:00:00Z'}).atMidnight,true);assert.equal(dailyPlan({now:'2026-07-15T08:00:00Z'}).atMidnight,false)});
test('catchup and idempotency avoid repeating daily preparation',()=>{const p=dailyPlan({now:'2026-11-15T10:00:00Z',lastCompletedDate:'2026-11-15'});assert.equal(p.needsPreparation,false);assert.equal(p.idempotencyKey,'trends-daily:America/Los_Angeles:2026-11-15')});
test('game date is Pacific rather than UTC',()=>{assert.equal(belongsToServiceDate('2026-11-16T03:00:00Z','2026-11-15'),true)});
test('confirmed timezone still cannot activate or publish',()=>{assert.equal(dailyPlan({now:'2026-11-15T08:00:00Z',timeZoneConfirmed:true}).publicationAllowed,false)});
