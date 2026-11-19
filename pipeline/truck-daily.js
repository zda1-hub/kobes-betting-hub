const { queue, forbidden, dayNumber } = require('./road-to-truck-schedule');

const templates = queue.filter(item => item.recurrence === 'daily_caption');
const fallback = queue.find(item => item.id === 'truck-daily-no-names');
const neutral = queue.find(item => item.id === 'truck-daily-neutral');
function dayFromLaunch(startedAt, date) {
  if (!startedAt || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Verified launch date required');
  // The wall activation timestamp proves the snapshot is live. Campaign Day 1
  // is the owner's X launch on Nov 19, even if setup happened the night before.
  const n = dayNumber(date);
  if (n < 1) throw new Error('Daily card predates wall activation');
  return n;
}
function buildDaily(snapshot, date) {
  if (!Number.isInteger(snapshot.spot) || snapshot.spot < 0 || !snapshot.startedAt || !snapshot.verifiedAt)
    throw new Error('Current verified wall snapshot is required');
  const day = dayFromLaunch(snapshot.startedAt, date);
  const names = (snapshot.newNames || []).slice(0, 3).map(name => String(name).slice(0, 20));
  const isDown = Number.isInteger(snapshot.previousSpot) && snapshot.spot < snapshot.previousSpot;
  const source = isDown ? neutral : names.length ? templates[(day - 1) % templates.length] : fallback;
  if (!source) throw new Error('Daily caption template missing');
  const values = {
    day: String(day), X: String(snapshot.spot),
    new_names: names.length ? names.join(', ') : "who's next on the wall?",
    top_ref: snapshot.topRef ? String(snapshot.topRef).slice(0, 20) : 'none yet',
  };
  const text = source.text.replace(/\{(day|X|new_names|top_ref)\}/g, (_, key) => values[key]);
  if (/\{[^}]+\}/.test(text)) throw new Error('Unfilled daily caption placeholder');
  const blocked = forbidden(text);
  if (blocked || text.length > 280) throw new Error(`Daily caption held: ${blocked || `X length ${text.length}`}`);
  if (forbidden(source.first_reply, {firstReply:true}) || source.first_reply.length > 280)
    throw new Error('Daily first reply failed compliance');
  return {id:`truck-daily-${date}`,platform:'x',scheduled_at:`${date}T10:00:00-07:00`,
    text,first_reply:source.first_reply,day,spot:snapshot.spot,newNames:names,topRef:snapshot.topRef,
    neutral:isDown,sourceId:source.id};
}
module.exports={buildDaily,dayFromLaunch};
