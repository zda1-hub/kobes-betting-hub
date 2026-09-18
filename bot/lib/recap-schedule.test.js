const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewWindow } = require('./recap-schedule');
const dates = { today: '2026-09-18', yesterday: '2026-09-17' };
test('morning recap becomes eligible at 07:00 Arizona and uses a different key from the night snapshot', () => {
  assert.equal(reviewWindow({ ...dates, date: dates.yesterday, time: '06:59' }), null);
  const morning = reviewWindow({ ...dates, date: dates.yesterday, time: '07:00' });
  const night = reviewWindow({ ...dates, date: dates.today, time: '21:00' });
  assert.equal(morning.key, 'morning'); assert.equal(night.key, 'nightly');
  assert.notEqual(morning.id, night.id);
  assert.equal(reviewWindow({ ...dates, date: '2026-09-16', time: '07:01' }), null);
});
