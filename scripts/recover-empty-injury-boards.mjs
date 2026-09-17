import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {Client,Events,GatewayIntentBits,PermissionFlagsBits}=require('discord.js');
const {injuryConfig,createInjuryDelivery}=require('../bot/lib/injury-reports');
const {pickLogPath,pacificOperatingDate}=require('../bot/lib/pick-log');
const {initializeAuditStore,closeAuditStore}=require('../pipeline/audit-store');
const {attachDiscordRestAudit}=require('../pipeline/api-client');

// Explicit operator recovery only for the initial, completely empty channels.
// Never remove messages or release a reservation in a populated channel.
if(!process.argv.includes('--verified-empty-channels'))throw new Error('Explicit empty-channel recovery acknowledgement required.');
const config=injuryConfig(),root=path.join(path.dirname(pickLogPath()),'injury-reports');
if(process.env.RENDER!=='true'||!root.startsWith('/var/data/')||!config.enabled||config.routes.length!==2)throw new Error('Existing Render injury configuration required.');
const client=new Client({intents:[GatewayIntentBits.Guilds]});
attachDiscordRestAudit(client.rest,{callerComponent:'scripts/recover-empty-injury-boards',triggerType:'owner_requested_injury_recovery'});
try{
  await initializeAuditStore();
  const ready=new Promise(resolve=>client.once(Events.ClientReady,resolve));
  await client.login(process.env.DISCORD_TOKEN);await ready;
  const date=pacificOperatingDate(),channels=new Map();
  for(const {league,channelId} of config.routes){
    const channel=await client.channels.fetch(channelId);
    if(channel.guildId!==process.env.DISCORD_GUILD_ID||!/injur/i.test(channel.name)||!channel.permissionsFor(client.user).has([
      PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory]))throw new Error('Injury destination check failed.');
    const recent=await channel.messages.fetch({limit:100});
    if(recent.size)throw new Error('Channel is populated; manual receipt reconciliation is required instead.');
    const file=path.join(root,`${date}-${league}.json`),state=JSON.parse(await fs.readFile(file,'utf8'));
    if(state.channelId!==channelId||state.pages.length!==1||state.pages[0].reserved!==true||state.pages[0].messageId)throw new Error('Unexpected initial reservation; no ledger was changed.');
    channels.set(channelId,{channel,file,state});
  }
  for(const {file,state} of channels.values()){
    state.pages[0]={reserved:false,recovery:'OPERATOR_VERIFIED_EMPTY_AFTER_PERMISSION_REPAIR',recoveredAt:new Date().toISOString()};
    await fs.writeFile(`${file}.tmp`,JSON.stringify(state),{mode:0o600});await fs.rename(`${file}.tmp`,file);
  }
  const delivery=createInjuryDelivery({root,routes:config.routes,channelFor:async id=>channels.get(id).channel});
  console.log('INITIAL_INJURY_DELIVERY',JSON.stringify(await delivery.run()));
  console.log('SECOND_REFRESH',JSON.stringify(await delivery.run()));
  await delivery.stop();
}catch{console.error('Empty-channel recovery failed safely; inspect cloud receipts before retrying.');process.exitCode=1;}
finally{client.destroy();await closeAuditStore();}
