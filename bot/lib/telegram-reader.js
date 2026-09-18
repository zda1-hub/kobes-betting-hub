const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pacificOperatingDate } = require('./pick-log');
const { exclusiveTextExtraction } = require('../../pipeline/exclusive-text');
const { assertPublishableExtraction, buildSourcePickEmbed, reviewButtons, approvalCopySha256 } = require('./source-review');
const { telegramConfig, loadTelegramSession } = require('./telegram-session');
const { reviewQueuePath } = require('./review-queue-path');
const { enrichPacket } = require('../../pipeline/enrich-pick');
const { recordSourcePost, upsertPickCandidate, recordApprovalCard, recordWorkflowEvent } = require('../../pipeline/audit-store');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function save(file,value){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(`${file}.tmp`,JSON.stringify(value),{mode:0o600});await fs.rename(`${file}.tmp`,file);}

function telegramPacket(message, channelId, now=new Date()) {
  if (String(message.peerId?.channelId || '') !== channelId || !Number.isSafeInteger(message.id)) throw new Error('Unexpected Telegram peer.');
  const posted=new Date(Number(message.date)*1000);
  if (!Number.isFinite(posted.getTime()) || posted>now || pacificOperatingDate(posted)!==pacificOperatingDate(now)) return null;
  const text=String(message.message||'');
  if (!message.photo && !message.media?.photo && !/\b(?:ML|moneyline|over|under|NRFI|YRFI|BTTS)\b|[+-]\d/.test(text)) return null;
  if (/\b(?:recap|yesterday|already won|cashed|results|final record|signup|subscribe)\b/i.test(text)) return null;
  const id=`tg-${pacificOperatingDate(now).replaceAll('-','')}-${channelId}-${message.id}`;
  return {pick_id:id,status:'NOT_STARTED',created_at:now.toISOString(),approval:{decision:null,approver:'Kobe'},
    source:{platform:'Telegram',handle:'cappers-free',display_name:'CAPPERS FREE',post_id:`${channelId}-${message.id}`,
      post_url:`https://t.me/c/${channelId}/${message.id}`,posted_at:posted.toISOString(),text,media_urls:[],
      publish_mode:'terms_only',reuse_permission:'OWNER_AUTHORIZED_REVIEW_ONLY'},analysis:{status:'NOT_STARTED'}};
}

function createTelegramReader({config, channelFor, now=()=>new Date(), logger=console, clientFactory,
  enrich=enrichPacket, audit={recordSourcePost,upsertPickCandidate,recordApprovalCard,recordWorkflowEvent}, queueRoot=reviewQueuePath()}) {
  let running=null, stopping=false, telegram=null, entity=null, retryAt=0;
  async function connect() {
    if(telegram?.connected && entity)return true;
    const session=await loadTelegramSession(config); if(!session)return false;
    if(clientFactory)telegram=await clientFactory(session);
    else {
      const {TelegramClient}=require('teleproto'),{StringSession}=require('teleproto/sessions'),{Logger}=require('teleproto/extensions/Logger');
      telegram=new TelegramClient(new StringSession(session),config.apiId,config.apiHash,
        {connectionRetries:2,floodSleepThreshold:0,baseLogger:new Logger('none'),maxConcurrentDownloads:1,
          deviceModel:'KBH cloud read-only approvals',appVersion:'1.0.0'});
    }
    await telegram.connect();
    if(!await telegram.checkAuthorization())throw new Error('Telegram session revoked.');
    // Resolve the one already-joined channel. Never join, message, react, or
    // mark chats read. No unrelated dialog history is inspected.
    const peer=JSON.parse(await fs.readFile(path.join(config.root,'channel-peer.json'),'utf8'));
    if(peer.channelId!==config.channelId || !/^-?\d+$/.test(peer.accessHash||''))throw new Error('Telegram peer configuration missing.');
    const {Api}=require('teleproto'),bigInt=require('big-integer');
    entity=await telegram.getEntity(new Api.InputPeerChannel({channelId:bigInt(config.channelId),accessHash:bigInt(peer.accessHash)}));
    if(String(entity.id)!==config.channelId || !entity.broadcast)throw new Error('Telegram channel identity mismatch.');
    return true;
  }
  async function drain() {
    if(stopping||now().getTime()<retryAt)return[];
    const file=path.join(config.root,'reader-state.json');let state;
    try {state=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;state={channelId:config.channelId,cursor:0,records:{}};}
    if(state.channelId!==config.channelId)throw new Error('Telegram channel changed.');
    if(!await connect())return[{status:'AWAITING_LOGIN'}];
    // Oldest-first pagination prevents a busy channel's newer messages from
    // hiding deferred picks. Initial catch-up starts at the current day only.
    let messages;
    if(!state.cursor){
      // Page backwards to the day's boundary, not just the latest 100 posts.
      // Refuse an incomplete baseline rather than silently lose older picks.
      messages=[];let offsetId=0,complete=false;
      for(let page=0;page<20;page++){
        const batch=await telegram.getMessages(entity,{limit:100,...(offsetId?{offsetId}:{})});
        messages.push(...batch);
        if(batch.length<100 || batch.some(message=>pacificOperatingDate(new Date(Number(message.date)*1000))<pacificOperatingDate(now()))){complete=true;break;}
        const next=Math.min(...batch.map(message=>message.id));
        if(offsetId && next>=offsetId)throw new Error('Telegram pagination did not advance.');
        offsetId=next;
      }
      if(!complete)throw new Error('Telegram current-day baseline exceeds safety limit; review before proceeding.');
      messages=[...new Map(messages.map(message=>[message.id,message])).values()].sort((a,b)=>a.id-b.id);
    } else messages=await telegram.getMessages(entity,{minId:state.cursor,reverse:true,limit:30});
    const channel=await channelFor();const results=[];let modelCalls=0;
    for(const message of messages){
      if(stopping)break;
      const packet=telegramPacket(message,config.channelId,now());
      if(!packet){state.cursor=Math.max(state.cursor,message.id);await save(file,state);continue;}
      const date=pacificOperatingDate(now()),packetFile=path.join(queueRoot,date,`${packet.pick_id}.json`);
      let previous=state.records[String(message.id)];
      if(previous?.status==='RESERVED'){
        const recent=await channel.messages.fetch({limit:100});
        const matches=[...recent.values()].filter(m=>m.author.id===channel.client.user.id
          &&m.components?.some(row=>row.components?.some(button=>(button.customId||button.custom_id||'').includes(packet.pick_id))));
        if(matches.length!==1){results.push({status:'UNCERTAIN_DELIVERY',messageId:message.id});break;}
        const saved=JSON.parse(await fs.readFile(packetFile,'utf8'));saved.discord_review_message_id=matches[0].id;saved.status='READY_FOR_APPROVAL';
        await save(packetFile,saved);await audit.recordApprovalCard(saved,{channelId:channel.id,messageId:matches[0].id,payload:previous.payload});
        previous=state.records[String(message.id)]={status:'DELIVERED',messageId:matches[0].id};await save(file,state);
      }
      if(previous){state.cursor=Math.max(state.cursor,message.id);await save(file,state);continue;}
      let analysis=exclusiveTextExtraction(packet.source,packet.source.text);
      if(analysis)packet.analysis={status:'SOURCE_EXTRACTED',source_only:true,extraction:analysis};
      else {
        if(modelCalls>=2){results.push({status:'DEFERRED_MODEL_CAP',messageId:message.id});break;}
        if(message.photo||message.media?.photo){
          const bytes=await telegram.downloadMedia(message,{thumb:-1});
          if(!Buffer.isBuffer(bytes)||bytes.length>10000000)throw new Error('Telegram image unavailable or oversized.');
          packet.source.media_urls=[`data:image/jpeg;base64,${bytes.toString('base64')}`];
        }
        packet.analysis=await enrich(packet,{beforeOpenAIRequest:()=>{if(modelCalls>=2)return false;modelCalls++;return true;}});
        packet.source.media_urls=[]; // no source image in private/public cards or saved packets.
        if(packet.analysis.status!=='SOURCE_EXTRACTED'){
          const extractionStatus=['EXTRACTION_FAILED','ENRICHMENT_OFF','WAITING_FOR_OPENAI_API_KEY','BUDGET_EXCEEDED','MODEL_CALL_LIMIT_REACHED'].includes(packet.analysis.status)?packet.analysis.status:'UNKNOWN';
          // Configuration and spending limits are not bad source content.
          // Retain the cursor so the source can recover after the limit clears.
          if(extractionStatus!=='EXTRACTION_FAILED'){
            results.push({status:'DEFERRED_EXTRACTION',extractionStatus,messageId:message.id});break;
          }
          state.extractionRetries=state.extractionRetries||{};
          const retries=(state.extractionRetries[String(message.id)]||0)+1;
          state.extractionRetries[String(message.id)]=retries;
          await save(file,state);
          if(retries<3){results.push({status:'DEFERRED_EXTRACTION',extractionStatus,messageId:message.id});break;}
          // Preserve an unreadable source for review, but don't let one poison
          // message permanently block every later pick in the channel.
          packet.analysis={status:packet.analysis.status,source_only:true,extraction:null};
          packet.status='HELD_EXTRACTION_FAILED';await save(packetFile,packet);
          state.records[String(message.id)]={status:'HELD_EXTRACTION_FAILED'};
          state.cursor=Math.max(state.cursor,message.id);await save(file,state);
          results.push({status:'HELD_EXTRACTION_FAILED',messageId:message.id});continue;
        }
      }
      await audit.recordSourcePost(packet);
      let payload;
      try {
        assertPublishableExtraction(packet);
        if(packet.analysis.extraction.missing_or_ambiguous?.length)throw new Error('Unclear source terms.');
        const embed=buildSourcePickEmbed(packet,'PAID PICK');
        if((embed.description||'').length>4000)throw new Error('Oversized capper card.');
        const fingerprint=hash(embed.description||'');
        if(Object.values(state.records).some(record=>record.fingerprint===fingerprint)){
          state.records[String(message.id)]={status:'DUPLICATE',fingerprint};state.cursor=Math.max(state.cursor,message.id);await save(file,state);continue;
        }
        packet.approval.exact_final_copy=embed.description;
        packet.approval.exact_final_copy_sha256=approvalCopySha256(packet.approval.exact_final_copy);
        packet.approval_ready=true;packet.status='READY_FOR_APPROVAL';
        payload={embeds:[embed],components:reviewButtons(packet.pick_id,{freeDisabled:true,freeLabel:'Free unavailable for exclusives',paidLabel:'Post to #exclusives'}),allowedMentions:{parse:[]}};
        previous={status:'RESERVED',fingerprint,payload};
      }catch{
        packet.status='HELD_UNCLEAR_TERMS';await save(packetFile,packet);
        state.records[String(message.id)]={status:'HELD_UNCLEAR_TERMS'};state.cursor=Math.max(state.cursor,message.id);await save(file,state);
        results.push({status:'HELD_UNCLEAR_TERMS',messageId:message.id});continue;
      }
      await audit.upsertPickCandidate(packet,{status:'READY_FOR_APPROVAL'});
      await save(packetFile,packet);state.records[String(message.id)]=previous;await save(file,state);
      await audit.recordWorkflowEvent(packet,{eventType:'APPROVAL_CARD_SEND_STARTED',afterState:'SENDING_APPROVAL_CARD'});
      const posted=await channel.send({...payload,nonce:hash(packet.pick_id).slice(0,24),enforceNonce:true});
      if(!posted?.id)throw new Error('Telegram private approval receipt missing.');
      packet.discord_review_message_id=posted.id;await save(packetFile,packet);
      await audit.recordApprovalCard(packet,{channelId:channel.id,messageId:posted.id,payload});
      state.records[String(message.id)]={status:'DELIVERED',messageId:posted.id,fingerprint:previous.fingerprint};
      state.cursor=Math.max(state.cursor,message.id);await save(file,state);results.push({status:'PRIVATE_APPROVAL_DELIVERED',messageId:message.id});
    }
    state.checkedAt=now().toISOString();await save(file,state);return results;
  }
  return {run(){if(!running&&!stopping)running=drain().catch(error=>{
      const seconds=Number(error?.seconds);retryAt=now().getTime()+(Number.isFinite(seconds)?Math.min(Math.max(seconds,60),86400):300)*1000;
      logger.error('Cloud Telegram reader needs attention; no Telegram messages or automatic member posts were sent.');return[{status:'NEEDS_ATTENTION'}];
    }).finally(()=>{running=null;});return running||Promise.resolve([]);},
    async stop(){stopping=true;if(running)await running;if(telegram)await telegram.disconnect();}};
}
module.exports={telegramPacket,createTelegramReader};
