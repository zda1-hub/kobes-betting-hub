/** Counting-rate summaries only. No network, storage or prediction. */
export function calculateRateRecord(record) {
  const values = {};
  for (const field of ['total', 'games', 'minutes']) {
    const text = String(record[field] ?? '').trim();
    const decimal = field === 'minutes';
    const valid = text.length <= 16 && (decimal ? /^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/ : /^\d+$/).test(text);
    const value = Number(text);
    const minimum = field === 'total' ? 0 : decimal ? 0.0001 : 1;
    if (!valid || !Number.isFinite(value) || value < minimum || value > 1_000_000) {
      const message = field === 'minutes'
        ? 'Enter minutes from 0.0001 to 1,000,000, with at most four decimal places.'
        : `Enter a whole-number ${field === 'total' ? 'total from 0' : 'appearance count from 1'} to 1,000,000.`;
      throw Object.assign(new Error(message), {field});
    }
    values[field] = value;
  }
  return {...values, perGame: values.total / values.games, perMinute: values.total / values.minutes, per36: values.total / values.minutes * 36};
}
