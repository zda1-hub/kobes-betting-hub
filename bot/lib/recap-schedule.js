function reviewWindow({ date, today, yesterday, time, morningAt = '07:00' }) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(morningAt)) throw new Error('Invalid morning recap time.');
  if (date === yesterday && time >= morningAt) return { key: 'morning', label: `${morningAt} Arizona morning`, id: `official-recap-morning-review-${date}` };
  return null;
}
module.exports = { reviewWindow };
