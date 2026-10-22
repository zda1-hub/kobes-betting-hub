import {calculateRateRecord} from './rate-calculations.mjs';
import {formatStatistic as fmt} from './statistics-calculations.mjs';
const form = document.querySelector('[data-rate-form]');
if (form) {
  const output = document.querySelector('[data-rate-output]');
  const error = document.querySelector('[data-rate-error]');
  const fallback = document.querySelector('[data-rate-fallback]');
  const fields = [...form.querySelectorAll('input')];
  function calculate() {
    output.replaceChildren();
    error.textContent = '';
    fields.forEach(input => input.removeAttribute('aria-invalid'));
    let invalid;
    const results = [];
    for (const name of ['a', 'b']) {
      const record = Object.fromEntries(['total', 'games', 'minutes'].map(key => [key, form.elements[`${name}-${key}`].value]));
      try { results.push(calculateRateRecord(record)); }
      catch (issue) {
        const input = form.elements[`${name}-${issue.field}`];
        input.setAttribute('aria-invalid', 'true');
        invalid ||= {input, message: `Record ${name.toUpperCase()}: ${issue.message}`};
      }
    }
    const period = form.elements.period.value.trim();
    if (!period) {
      form.elements.period.setAttribute('aria-invalid', 'true');
      invalid ||= {input: form.elements.period, message: 'Describe the common reporting window.'};
    }
    if (invalid) { error.textContent = invalid.message; invalid.input.focus(); return; }
    const table = document.createElement('table');
    table.className = 'stat-comparison stat-rates';
    const caption = table.createCaption();
    caption.textContent = `${form.elements.statistic.value} — ${period}`;
    const header = table.createTHead().insertRow();
    for (const label of ['Measure', 'Record A', 'Record B']) {
      const cell = document.createElement('th'); cell.scope='col'; cell.textContent=label; header.append(cell);
    }
    const body = table.createTBody();
    for (const [key, label] of [['total','Total'], ['games','Appearances'], ['minutes','Minutes'], ['perGame','Per game'], ['perMinute','Per minute'], ['per36','Per 36 minutes']]) {
      const row=body.insertRow(), heading=document.createElement('th');
      heading.scope='row'; heading.textContent=label; row.append(heading);
      results.forEach(result => { row.insertCell().textContent=fmt(result[key]); });
    }
    output.append(table);
    results.forEach((record,index) => {
      const step=document.createElement('p');
      step.textContent=`Record ${index ? 'B' : 'A'}: ${fmt(record.total)} ÷ ${fmt(record.games)} = ${fmt(record.perGame)} per game; ${fmt(record.total)} ÷ ${fmt(record.minutes)} = ${fmt(record.perMinute)} per minute; (${fmt(record.total)} ÷ ${fmt(record.minutes)}) × 36 = ${fmt(record.per36)} per 36 minutes.`;
      output.append(step);
    });
    const note=document.createElement('p');
    note.textContent='Results describe these inputs, not future performance. Display rounded to four decimal places; calculations use the entered values.';
    output.append(note);
  }
  form.addEventListener('submit', event => {event.preventDefault(); calculate();});
  form.querySelector('[data-rate-reset]').addEventListener('click', () => {form.reset(); calculate();});
  form.hidden=false;
  fallback.hidden=true;
  calculate();
}
