'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceRows } = require('./name-wall-sync');

test('paid spot query includes existing paid VIPs while referral tiers remain launch-only', async () => {
  const queries=[];
  const pool={async query(sql,args){
    queries.push({sql,args});
    return queries.length===1?{rows:[]}:queries.length===2?{rows:[{n:11,legacy_n:11}]}:
      {rows:Array.from({length:11},(_,i)=>({customerId:`cus_${i}`,discordId:null,firstPaidAt:'2026-11-01T00:00:00Z'}))};
  }};
  const start='2026-11-19T01:00:00.000Z';
  const result=await sourceRows(pool,start);
  assert.equal(result.activePaidSpots,11);
  assert.equal(result.legacyPaidSpots,11);
  assert.equal(result.activePaidMembers.length,11);
  assert.deepEqual(result.referrals,[]);
  assert.match(queries[0].sql,/WHERE r\.created_at >= \$1/);
  assert.doesNotMatch(queries[1].sql,/ms\.created_at >= \$1/);
  assert.doesNotMatch(queries[1].sql,/b\.occurred_at >= \$1/);
  assert.deepEqual(queries[1].args,[start]);
  assert.match(queries[2].sql,/membership_customers/);
  assert.match(queries[2].sql,/MIN\(b\.occurred_at\)/);
});
