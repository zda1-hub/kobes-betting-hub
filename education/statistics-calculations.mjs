/** Descriptive summaries only. No network, storage, or prediction. */
export const MAX_VALUES = 30;
export const MAX_ABSOLUTE_VALUE = 1_000_000;
export const INPUT_ERROR = 'Enter 1–30 numbers between −1,000,000 and 1,000,000, separated by commas or spaces. Omit units, percent signs and thousands separators.';
export function summarizeValues(text) {
  if (typeof text !== 'string' || text.length > 2000 || !text.trim()) throw new Error(INPUT_ERROR);
  // Commas delimit values (1,000 means two observations: 1 and 0).
  const parts = text.trim().split(/[\s,]+/);
  if (parts.length > MAX_VALUES || parts.some(value => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) throw new Error(INPUT_ERROR);
  const values = parts.map(Number);
  if (values.some(value => !Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_VALUE)) throw new Error(INPUT_ERROR);
  values.sort((a,b) => a-b);
  const count = values.length;
  const sum = values.reduce((total,value) => total+value,0);
  const middle = Math.floor(count/2);
  const median = count % 2 ? values[middle] : (values[middle-1]+values[middle])/2;
  return {values,count,sum,mean:sum/count,median,range:values[count-1]-values[0]};
}
export function formatStatistic(value) {
  const rounded = Number(value.toFixed(4));
  return (Object.is(rounded,-0) ? 0 : rounded).toLocaleString('en-US',{maximumFractionDigits:4});
}
