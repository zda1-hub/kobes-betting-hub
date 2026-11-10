const ZONE = 'America/Los_Angeles';

// One Free Pick slot is reserved every day for the existing canonical publisher.
// Native Instagram polls are held for the app because Graph cannot add a poll.
const SLOTS = Object.freeze({
  mon0900: { day: 1, time: '09:00', kind: 'recap' },
  mon1130: { day: 1, time: '11:30', kind: 'free_pick' },
  mon1500: { day: 1, time: '15:00', kind: 'arbitrage' },
  mon1830: { day: 1, time: '18:30', kind: 'review' },
  tue0900: { day: 2, time: '09:00', kind: 'native_poll' },
  tue1130: { day: 2, time: '11:30', kind: 'free_pick' },
  tue1500: { day: 2, time: '15:00', kind: 'behind_scenes' },
  tue1900: { day: 2, time: '19:00', kind: 'review' },
  wed0900: { day: 3, time: '09:00', kind: 'bankroll' },
  wed1130: { day: 3, time: '11:30', kind: 'free_pick' },
  wed1430: { day: 3, time: '14:30', kind: 'education' },
  wed1800: { day: 3, time: '18:00', kind: 'vip_cta' },
  thu0900: { day: 4, time: '09:00', kind: 'native_poll' },
  thu1130: { day: 4, time: '11:30', kind: 'free_pick' },
  thu1530: { day: 4, time: '15:30', kind: 'arbitrage' },
  thu1930: { day: 4, time: '19:30', kind: 'review' },
  fri0900: { day: 5, time: '09:00', kind: 'education' },
  fri1130: { day: 5, time: '11:30', kind: 'free_pick' },
  fri1500: { day: 5, time: '15:00', kind: 'vip_tease' },
  fri1900: { day: 5, time: '19:00', kind: 'recap_or_review' },
  sat0930: { day: 6, time: '09:30', kind: 'free_pick' },
  sat1200: { day: 6, time: '12:00', kind: 'native_poll' },
  sat1500: { day: 6, time: '15:00', kind: 'arbitrage' },
  sat1830: { day: 6, time: '18:30', kind: 'settled_slips' },
  sun0930: { day: 0, time: '09:30', kind: 'free_pick' },
  sun1130: { day: 0, time: '11:30', kind: 'vip_tease' },
  sun1530: { day: 0, time: '15:30', kind: 'native_poll' },
  sun2030: { day: 0, time: '20:30', kind: 'recap_or_review' },
});

function pacificParts(date) {
  const pieces = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(pieces.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

function slotInstant(date, slotId) {
  const midday = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(midday.getTime()) || midday.toISOString().slice(0, 10) !== date) throw new Error('Use a valid YYYY-MM-DD date.');
  const slot = SLOTS[slotId];
  if (!slot) throw new Error('Unknown calendar slot.');
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== slot.day) throw new Error('Slot does not match that Pacific weekday.');
  const [hour, minute] = slot.time.split(':').map(Number);
  const desired = `${date} ${slot.time}`;
  // Pacific is UTC-7 or UTC-8. Verify the actual local clock so DST is safe.
  for (const offset of [7, 8]) {
    const instant = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour + offset, minute));
    const p = pacificParts(instant);
    if (`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` === desired) return instant.toISOString();
  }
  throw new Error('Calendar slot has no unambiguous Pacific instant.');
}

function approvedSlot(date, slotId, now = Date.now()) {
  const slot = SLOTS[slotId];
  const scheduledAt = slotInstant(date, slotId);
  if (slot.kind === 'free_pick') throw new Error('The existing approved Free Pick workflow owns this slot.');
  if (slot.kind === 'native_poll') throw new Error('Native Instagram polls require a person in the Instagram app.');
  if (Date.parse(scheduledAt) <= now + 10 * 60_000) throw new Error('This slot is past or too close. Missed slots are not replayed.');
  if (Date.parse(scheduledAt) > now + 14 * 86_400_000) throw new Error('Schedule within the next 14 days so facts stay current.');
  return { ...slot, id: `cal-${date.replaceAll('-', '')}-${slotId}`, date, slotId, scheduledAt };
}

module.exports = { ZONE, SLOTS, slotInstant, approvedSlot };
