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

module.exports = { arizonaDate, datedTimeOverride };
