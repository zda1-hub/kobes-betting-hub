'use strict';
// Planning only. This module does not run timers, call providers, or publish.
const TIME_ZONE='America/Los_Angeles';
function localParts(instant,timeZone){
  const d=new Date(instant); if(!Number.isFinite(d.valueOf()))throw new Error('Invalid instant');
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)};
}
function dailyPlan({now,timeZone=TIME_ZONE,timeZoneConfirmed=true,lastCompletedDate=null}={}){
  const local=localParts(now,timeZone);
  return {
    enabled:false, timeZone,timeZoneConfirmed,
    serviceDate:local.date,
    // A resilient worker may catch up after midnight, but only once per local day.
    needsPreparation:lastCompletedDate!==local.date,
    atMidnight:local.hour===0 && local.minute===0,
    idempotencyKey:`trends-daily:${timeZone}:${local.date}`,
    publicationAllowed:false,
    reason:timeZoneConfirmed?'Design only: activation and licensed data validation pending':'Timezone must be confirmed',
  };
}
function belongsToServiceDate(gameStartsAt,serviceDate,timeZone=TIME_ZONE){
  return localParts(gameStartsAt,timeZone).date===serviceDate;
}
module.exports={TIME_ZONE,localParts,dailyPlan,belongsToServiceDate};
