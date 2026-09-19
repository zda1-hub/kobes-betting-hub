function arizonaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function datedTimeOverride({ now = new Date(), overrideDate, overrideAt, recurringAt }) {
  return String(overrideDate || '').trim() === arizonaDate(now) && String(overrideAt || '').trim()
    ? String(overrideAt).trim()
    : String(recurringAt || '').trim();
}

function arizonaDailyTimestampMs(time, now = new Date()) {
  return new Date(`${arizonaDate(now)}T${time}:00-07:00`).getTime();
}

function nextArizonaDailyStartMs(time, now = new Date()) {
  const today = arizonaDailyTimestampMs(time, now);
  return now.getTime() < today ? today : today + 24 * 60 * 60 * 1000;
}

module.exports = { arizonaDailyTimestampMs, arizonaDate, datedTimeOverride, nextArizonaDailyStartMs };
