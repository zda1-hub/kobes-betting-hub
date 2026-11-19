const queue = require('../content/road_to_truck.json');
const addedCaptions = require('../content/truck_captions.json');
const { sportsbooks } = require('../content/truck_config.json');

const DAY_MS = 86400000;
const START = '2026-11-19';
const FALLBACK_RECORD = '26-17';
const FIXED_OFFSET = '-07:00';
const REFERRAL_IDS = ['truck-referral-x-1', 'truck-referral-x-2', 'truck-referral-x-3', 'truck-referral-x-4', 'truck-gta-referral-2026-11-19'];
const STATIC_REFERRAL_IDS = new Set(['truck-referral-x-1', 'truck-referral-x-2', 'truck-referral-x-3', 'truck-referral-x-4']);

function mstDate(value) { return new Date(new Date(value).getTime() - 7 * 3600000).toISOString().slice(0, 10); }
function mstStamp(date, hour, minute = 0) { return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${FIXED_OFFSET}`; }
function dayNumber(date) { return Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(START + 'T00:00:00Z')) / DAY_MS) + 1; }
function datePlus(date, days) { return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10); }
function dayOfWeek(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); }
function byId(id) { const item = queue.find(row => row.id === id); if (!item) throw new Error(`Missing truck queue item ${id}`); return item; }
function renderText(text, record = FALLBACK_RECORD) { return text.replaceAll('{RECORD}', record); }
function forbidden(text) {
  const value = String(text || '');
  const terms = [/(?:^|\W)lock(?:$|\W)/i, /\bguaranteed\b/i, /\bprofit\b/i, /\bparlay\b/i, /\b\d+(?:\.\d+)?\s*(?:units?|u)\b/i];
  const blocked = terms.find(term => term.test(value));
  if (blocked) return `blocked term: ${blocked}`;
  const book = sportsbooks.find(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').test(value));
  if (book) return `sportsbook: ${book}`;
  if (!/21\s*\+/.test(value)) return 'missing 21+';
  return null;
}
function validateItem(item, record = FALLBACK_RECORD) {
  const text = renderText(item.text, record);
  const reason = forbidden(text);
  if (reason) throw new Error(`${item.id}: ${reason}`);
  if (item.platform === 'x' && text.length > 280) throw new Error(`${item.id}: X text has ${text.length} characters`);
  if (item.platform === 'x') {
    if (!item.first_reply) throw new Error(`${item.id}: X first reply missing`);
    const replyReason = forbidden(item.first_reply);
    if (replyReason) throw new Error(`${item.id} first reply: ${replyReason}`);
    if (item.first_reply.length > 280) throw new Error(`${item.id}: X first reply too long`);
  }
  return { ...item, text };
}
function recurringDay(date) {
  const n = dayNumber(date);
  if (n < 8) return null;
  const custom = addedCaptions.length ? addedCaptions[(n - 8) % addedCaptions.length] : null;
  const source = custom || byId(`truck-day-${2 + (n - 8) % 6}`);
  const text = typeof source === 'string' ? source : source.text;
  const firstReply = typeof source === 'string' ? byId('truck-day-2').first_reply : source.first_reply;
  return { id: `truck-day-${n}`, platform: 'x', scheduled_at: mstStamp(date, 18),
    text: text.replace(/^day \d+\./i, `day ${n}.`), first_reply: firstReply,
    image: `assets/road_to_truck/day-${n}.png`, cardDay: n };
}
function referralForDate(date) {
  const first = '2026-11-24';
  let index = 0;
  for (let cursor = first; cursor < date; cursor = datePlus(cursor, 1)) {
    if ([2, 5].includes(dayOfWeek(cursor))) index++;
  }
  const source = byId(REFERRAL_IDS[index % REFERRAL_IDS.length]);
  return { ...source, id: `truck-referral-recurring-${date}`, scheduled_at: mstStamp(date, 12), sourceId: source.id };
}
function schedule(from, days = 14) {
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : mstDate(from);
  const result = [];
  for (let i = 0; i < days; i++) {
    const date = datePlus(fromDate, i);
    if (date < START) continue;
    for (const item of queue) {
      if (!item.scheduled_at || item.trigger || item.recurrence || STATIC_REFERRAL_IDS.has(item.id)) continue;
      if (mstDate(item.scheduled_at) === date) result.push({ ...item, cardDay: item.id.startsWith('truck-day-') ? Number(item.id.split('-').at(-1)) : undefined });
    }
    const extraDay = recurringDay(date);
    if (extraDay) result.push(extraDay);
    if (date >= '2026-11-23' && dayOfWeek(date) === 1) {
      result.push({ ...byId('truck-discord-pin'), id: `truck-discord-referral-monday-${date}`, scheduled_at: mstStamp(date, 10), pin: false, priority: 0 });
      result.push({ ...byId('truck-discord-weekly-leaderboard'), id: `truck-discord-weekly-leaderboard-${date}`, scheduled_at: mstStamp(date, 10), priority: 1, week: date });
    }
    if (date >= '2026-11-24' && [2, 5].includes(dayOfWeek(date))) result.push(referralForDate(date));
  }
  return result.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || (a.priority || 0) - (b.priority || 0) || a.id.localeCompare(b.id));
}
function due(items, now = new Date(), enabled = true) {
  if (!enabled) return { ready: [], expired: [] };
  const current = +new Date(now);
  return { ready: items.filter(item => current >= +new Date(item.scheduled_at) && current - +new Date(item.scheduled_at) <= 2 * 3600000),
    expired: items.filter(item => current - +new Date(item.scheduled_at) > 2 * 3600000) };
}

module.exports = { queue, schedule, due, validateItem, forbidden, renderText, mstDate, mstStamp, dayNumber, datePlus,
  FALLBACK_RECORD, REFERRAL_IDS };
