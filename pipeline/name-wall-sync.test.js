'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceRows } = require('./name-wall-sync');

test('paid spot query includes existing paid VIPs while referral tiers remain launch-only', async () => {
  const queries=[];
  const pool={async query(sql,args){
    queries.push({sql,args});
    return queries.length===1?{rows:[]}:{rows:[{n:11,legacy_n:11}]};
  }};
  const start='2026-11-19T01:00:00.000Z';
  const result=await sourceRows(pool,start);
  assert.deepEqual(result,{referrals:[],activePaidSpots:11,legacyPaidSpots:11});
  assert.match(queries[0].sql,/WHERE r\.created_at >= \$1/);
  assert.doesNotMatch(queries[1].sql,/ms\.created_at >= \$1/);
  assert.doesNotMatch(queries[1].sql,/b\.occurred_at >= \$1/);
  assert.deepEqual(queries[1].args,[start]);
});
