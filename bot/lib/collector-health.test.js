const test=require('node:test');const assert=require('node:assert/strict');
const {collectorHealthPayload}=require('./collector-health');
test('spend cap is blocked, never represented as no new picks',()=>{
 const r=collectorHealthPayload({apiBlocked:'X_SPEND_CAP',failedSources:4,created:0});
 assert.equal(r.state,'BLOCKED');assert.match(r.payload.embeds[0].description,/owner raises the cap/);
 assert.deepEqual(r.payload.allowedMentions,{parse:[]});
});
test('partial failures retain successful intake and healthy passes clear the alert',()=>{
 assert.equal(collectorHealthPayload({failedSources:1,created:3}).state,'DEGRADED');
 assert.equal(collectorHealthPayload({created:4}).state,'RECOVERED');
});
