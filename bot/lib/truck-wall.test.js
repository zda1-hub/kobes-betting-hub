'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PermissionFlagsBits,Collection}=require('discord.js');
const {plan,setup,explainer,announcement,ROLES,CHANNELS}=require('./truck-wall');
const {forbidden,validateItem}=require('../../pipeline/road-to-truck-schedule');
const {referralRewardLine}=require('../../content/truck_config.json');
const guild={id:'1215407647155683358',members:{me:{roles:{highest:{position:15}},permissions:{has(flag){return flag===PermissionFlagsBits.ManageRoles||flag===PermissionFlagsBits.ManageChannels||flag===PermissionFlagsBits.ManageMessages}}}},
  roles:{cache:new Collection()},channels:{cache:new Collection()}};
test('dry-run plans four roles, category and four channels with no writes',async()=>{
  const result=await setup(guild,{dryRun:true,env:{NAME_WALL_ENABLED:'false'}});
  assert.equal(result.writes,0);assert.equal(result.roles.length,4);assert.equal(result.channels.length,4);
  assert.deepEqual(result.roles.map(x=>x.name),ROLES.map(x=>x.name));
  assert.deepEqual(result.channels.map(x=>x.name),CHANNELS.map(x=>x.name));
  assert.equal(result.permissions.manageRoles,true);
});
test('live setup refuses disabled flag before any guild write',async()=>{
  await assert.rejects(()=>setup(guild,{dryRun:false,env:{NAME_WALL_ENABLED:'false'}}),/must be true/);
});
test('a low role ceiling is safe because new roles are inserted at the bottom',async()=>{
  const low={...guild,members:{me:{...guild.members.me,roles:{highest:{position:4}}}}};
  const report=await setup(low,{dryRun:true});
  assert.equal(report.permissions.placementCeiling,4);
  assert.equal(report.permissions.canPlaceFourRoles,true);
});
test('an existing truck role at or above the bot is reported before writes',async()=>{
  const roles=new Collection([['rider',{id:'rider',name:'Rider',position:15,permissions:{has(){return false;}}}]]);
  const blocked={...guild,roles:{cache:roles}};
  const report=await setup(blocked,{dryRun:true});
  assert.deepEqual(report.permissions.unmanageableTruckRoles,['Rider']);
  await assert.rejects(()=>setup(blocked,{dryRun:false,env:{NAME_WALL_ENABLED:'true'}}),/Existing roles at\/above bot: Rider/);
});
test('explainer previews exact zero progress and the approved referral reward',()=>{
  const json=explainer(0).toJSON();
  assert.match(json.description,/spot 0 of 200/);assert.match(json.description,/US 21\+ only/);
  assert.match(json.description,/month 2/);assert.ok(json.description.includes(referralRewardLine));
  assert.match(announcement(null,0),/spot 0 of 200/);
  assert.ok(announcement(null,0).includes(referralRewardLine));
});
test('attributed production copy and Road Crew perk pass truck compliance',()=>{
  const guide=explainer(0).toJSON().description;
  const launch=announcement(null,0);
  assert.match(guide,/elon says cybertruck production ends summer 2027/);
  assert.match(guide,/road crew chat \+ truck updates \+ shoutouts/);
  assert.doesNotMatch(guide,/early picks/i);
  assert.match(launch,/elon says production ends summer 2027/);
  for (const text of [guide,launch]) {
    assert.equal(forbidden(text),null);
    assert.match(text,/21\+/);
    assert.match(text,/not a guarantee/);
    assert.equal(validateItem({id:'truck-copy-test',platform:'discord',text}).text,text);
  }
});
