const { auditedFetch } = require('../../pipeline/api-client');
const { renderFreePickChatCard } = require('./free-pick-chat-card');
const { visiblePlays } = require('./source-review');
async function emailFreePickGraphic(row, packet, {environment=process.env, fetchImpl=fetch, render=renderFreePickChatCard}={}) {
  const secret = environment.FREE_PICK_SITE_PUBLISH_SECRET;
  if (!secret) throw new Error('Free Pick graphic email is not configured.');
  const extraction = packet.analysis?.extraction || {}, play=extraction.plays?.[0] || extraction;
  const player=visiblePlays(packet)[0]?.playerName || '', raw=play.selection || '';
  const selection=player&&!raw.toLowerCase().includes(player.toLowerCase()) ? `${player} ${raw}`.trim() : raw;
  const form = new FormData();form.append('pickId',packet.pick_id);form.append('discordUrl',row.post_reference);
  form.append('selection',selection);form.append('odds',String(play.odds_american || ''));
  form.append('card',new Blob([await render({ ...packet, operating_date: row.operating_date || packet.operating_date })],{type:'image/jpeg'}),`KBH-${packet.pick_id}.jpg`);
  const origin=(environment.FREE_PICK_SITE_PUBLISH_URL || 'https://bettinghub-publisher.kobedirwin.workers.dev').replace(/\/$/,'');
  const response = await auditedFetch(`${origin}/api/free-pick/social-email`,{method:'POST',headers:{authorization:`Bearer ${secret}`},body:form},
    {service:'cloudflare-worker',endpointClass:'/api/free-pick/social-email',callerComponent:'bot/lib/free-pick-social-email',triggerType:'approved_pick_social_email',pickId:packet.pick_id},fetchImpl);
  const result=await response.json().catch(()=>({}));
  if (!response.ok || !['sent','pending','sending'].includes(result.status)) throw new Error('Free Pick graphic email needs review.');
  return result;
}
module.exports={emailFreePickGraphic};
