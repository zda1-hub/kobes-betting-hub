const test = require('node:test');
const assert = require('node:assert/strict');
const { recordEligibility, KOBE_APPROVER_ID } = require('./record-eligibility');
const row = overrides => ({approver:KOBE_APPROVER_ID,approved_at:'2026-10-04T18:00:00Z',published_at:'2026-10-04T18:01:00Z',post_reference:'https://discord.com/channels/1/2/3',status:'PUBLISHED',...overrides});

test('only Kobe-approved published free and VIP picks are eligible',()=>{
 const free=row({destination:'#free-pick'}),vip=row({destination:'#expert-picks',status:'GRADED'});
 const result=recordEligibility([free,vip,row({approver:'Kobe'}),row({approver:'1539103276107046955'}),row({status:'REJECTED'}),row({post_reference:''})]);
 assert.deepEqual(result.eligible,[free,vip]);
 assert.equal(result.excluded.otherApprover,2);assert.equal(result.excluded.unpublished,2);
});
test('approval evidence must precede a valid publication timestamp',()=>{
 const result=recordEligibility([row({approved_at:''}),row({approved_at:'bad'}),row({published_at:'bad'}),row({approved_at:'2026-10-04T18:02:00Z'})]);
 assert.equal(result.eligible.length,0);assert.equal(result.excluded.missingApprovalTime,2);assert.equal(result.excluded.invalidPublicationTime,2);
});
