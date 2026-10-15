const test=require('node:test'),assert=require('node:assert/strict');
const {emailFreePickGraphic}=require('./free-pick-social-email');
const packet={pick_id:'approved-1',analysis:{extraction:{selection:'Over 3.5 receptions',player_name:'DeVaughn Vele',line:'3.5',odds_american:'+350'}}};
const row={operating_date:'2026-10-15',post_reference:'https://discord.com/channels/1/2/3'};
test('sends selected Discord reference and exact named wager to protected endpoint',async()=>{
 let calls=0;
 const result=await emailFreePickGraphic(row,packet,{environment:{FREE_PICK_SITE_PUBLISH_SECRET:'fixture',FREE_PICK_SITE_PUBLISH_URL:'https://publisher.test'},render:async(p)=>{assert.equal(p.operating_date,row.operating_date);return Buffer.from([255,216,255]);},fetchImpl:async(url,init)=>{
  calls++;assert.equal(url,'https://publisher.test/api/free-pick/social-email');assert.equal(init.headers.authorization,'Bearer fixture');assert.equal(init.body.get('selection'),'DeVaughn Vele Over 3.5 receptions');assert.equal(init.body.get('odds'),'+350');assert.equal(init.body.get('discordUrl'),row.post_reference);assert.equal(init.body.get('card').type,'image/jpeg');
  return new Response(JSON.stringify({status:'sent',messageId:'receipt'}),{status:201});}});
 assert.equal(calls,1);assert.equal(result.status,'sent');
});
test('email failures are surfaced for recovery rather than acknowledged',async()=>{
 await assert.rejects(emailFreePickGraphic(row,packet,{environment:{},render:async()=>Buffer.from([])}),/not configured/);
 await assert.rejects(emailFreePickGraphic(row,packet,{environment:{FREE_PICK_SITE_PUBLISH_SECRET:'fixture'},render:async()=>Buffer.from([]),fetchImpl:async()=>new Response(JSON.stringify({status:'held'}),{status:409})}),/needs review/);
});
