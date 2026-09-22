const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewWindow } = require('./recap-schedule');
const dates = { today: '2026-09-18', yesterday: '2026-09-17' };
test('only the previous-day recap becomes eligible at 07:00 Arizona', () => {
  assert.equal(reviewWindow({ ...dates, date: dates.yesterday, time: '06:59' }), null);
  const morning = reviewWindow({ ...dates, date: dates.yesterday, time: '07:00' });
  const night = reviewWindow({ ...dates, date: dates.today, time: '21:00' });
  assert.equal(morning.key, 'morning');
  assert.equal(night, null);
  assert.equal(morning.id, 'official-recap-morning-review-2026-09-17');
  assert.equal(reviewWindow({ ...dates, date: '2026-09-16', time: '07:01' }), null);
});
