const hooks = require('../content/truck_daily_hooks.json');
const { queue, forbidden, dayNumber } = require('./road-to-truck-schedule');

const reply = queue.find(item => item.id === 'truck-daily-empty-wall')?.first_reply;
function dayFromLaunch(startedAt, date) {
  if (!startedAt || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Verified launch date required');
  // Campaign Day 1 is the owner's Nov 19 X launch, even if setup happened earlier.
  const n = dayNumber(date);
  if (n < 1) throw new Error('Daily card predates wall activation');
  return n;
}
function hookForDate(date) {
  if (hooks.length < 10) throw new Error('At least 10 daily hooks are required');
  const index=(dayNumber(date)-1)%hooks.length;
  return {index,text:hooks[index]};
}
function buildDaily(snapshot, date) {
  if (!Number.isInteger(snapshot.spot) || snapshot.spot < 0 || !snapshot.startedAt || !snapshot.verifiedAt ||
      !Array.isArray(snapshot.wallNames) || snapshot.wallNames.length !== snapshot.spot || !Array.isArray(snapshot.newNames))
    throw new Error('Verified paid VIP names must match the current active paid VIP count');
  const day = dayFromLaunch(snapshot.startedAt, date);
  const id=`truck-daily-${date}`;
  if (!snapshot.newNames.length) return {id,day,spot:snapshot.spot,skipReason:'no new paid VIP names in the last 24 hours'};
  const names=snapshot.newNames.map(name=>String(name).slice(0,20));
  const {index,text:hook}=hookForDate(date);
  const rendered=hook.replaceAll('{lead}',names[0]).replaceAll('{count}',String(snapshot.spot))
    .replaceAll('{new_count}',String(names.length));
  const text=`day ${day}. ${rendered}\n\n21+ | not a guarantee`;
  if (/\{[^}]+\}/.test(text)) throw new Error('Unfilled daily hook');
  const blocked=forbidden(text);
  if (blocked || text.length>280) throw new Error(`Daily caption held: ${blocked||`X length ${text.length}`}`);
  if (!reply || forbidden(reply,{firstReply:true}) || reply.length>280)
    throw new Error('Daily first reply failed compliance');
  return {id,platform:'x',scheduled_at:`${date}T10:00:00-07:00`,text,first_reply:reply,
    day,spot:snapshot.spot,newNames:names,wallNames:snapshot.wallNames,topRef:snapshot.topRefCount>=1?snapshot.topRef:null,
    hookIndex:index,sourceId:`truck-daily-hook-${index+1}`};
}
module.exports={buildDaily,dayFromLaunch,hookForDate};
