'use strict';
require('dotenv').config();
const {Client,GatewayIntentBits} = require('discord.js');
const {plan,setup,ROLES,CHANNELS,explainer,announcement} = require('./lib/truck-wall');
async function main(){
  if(!process.argv.includes('--dry-run')) throw new Error('This script is dry-run only. Use staff /truck-setup after enabling the feature.');
  let result;
  if(process.env.DISCORD_TOKEN&&process.env.DISCORD_GUILD_ID){
    const client=new Client({intents:[GatewayIntentBits.Guilds]});
    try{await client.login(process.env.DISCORD_TOKEN);const guild=await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
      await guild.roles.fetch();await guild.channels.fetch();await guild.members.fetchMe();result=await setup(guild,{dryRun:true});}
    finally{client.destroy();}
  } else result={writes:0,permissions:'unknown: DISCORD_TOKEN and DISCORD_GUILD_ID unavailable locally',
    roles:ROLES.map((x,index)=>({name:x.name,action:'create or reconcile',color:'#'+x.color.toString(16).toUpperCase(),hoisted:true,mentionable:false,order:index+1,placement:'below bot and staff/VIP roles'})),
    category:{name:'🛻 ROAD TO THE TRUCK',action:'create or reuse',visibility:'everyone'},channels:CHANNELS.map(x=>({name:x.name,visibility:x.public?'everyone':x.allowed.join(', '),send:x.readOnly?'bot/staff only':'permitted roles',overwrites:x.public
      ?{'@everyone':['allow ViewChannel','allow ReadMessageHistory','deny SendMessages'],'bot':['allow ViewChannel','allow SendMessages','allow ManageMessages'],'staff':['allow ViewChannel','allow SendMessages','allow ReadMessageHistory']}
      :{'@everyone':['deny ViewChannel'],'bot':['allow ViewChannel','allow SendMessages','allow ManageMessages'],'staff':['allow ViewChannel','allow SendMessages','allow ReadMessageHistory'],[x.allowed.join('/')]:['allow ViewChannel','allow SendMessages','allow ReadMessageHistory']}})),
    explainer:explainer(0),announcement:announcement(null,0)};
  const output={...result,explainer:result.explainer?.toJSON?.()||result.explainer,emptyWall:{spot:'spot 0 of 200',names:[]},sampleTierUp:'🛻 FIRST NAME ON THE TRUCK: Sample Rider. spot 1 of 200. you\'re next → kobesbettinghub.com/refer | 21+ not a guarantee'};
  console.log(JSON.stringify(output,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
