import {summarizeValues,formatStatistic as fmt,INPUT_ERROR} from './statistics-calculations.mjs';
const form = document.querySelector('[data-stat-form]');
if (form) {
  const input=form.querySelector('textarea');
  const error=document.querySelector('[data-stat-error]');
  const output=document.querySelector('[data-stat-output]');
  const fallback=document.querySelector('[data-stat-fallback]');
  function calculate() {
    output.replaceChildren();
    error.textContent='';
    input.removeAttribute('aria-invalid');
    try {
      const result=summarizeValues(input.value);
      const list=document.createElement('dl');
      list.className='stat-summary';
      for (const key of ['count','sum','mean','median','range']) {
        const term=document.createElement('dt'),value=document.createElement('dd');
        term.textContent=key[0].toUpperCase()+key.slice(1);
        value.textContent=fmt(result[key]);
        list.append(term,value);
      }
      output.append(list);
      const middle=Math.floor(result.count/2);
      const medianStep=result.count%2
        ? `Median: ordered value ${middle+1} is ${fmt(result.median)}.`
        : `Median: (${fmt(result.values[middle-1])} + ${fmt(result.values[middle])}) ÷ 2 gives ${fmt(result.median)}.`;
      for (const line of [
        'Ordered values: '+result.values.map(fmt).join(', '),
        `Mean: sum ${fmt(result.sum)} ÷ count ${result.count} gives ${fmt(result.mean)}.`,
        medianStep,
        `Range: ${fmt(result.values.at(-1))} − ${fmt(result.values[0])} gives ${fmt(result.range)}.`,
        'Displayed numbers are rounded to four decimal places when needed. Calculations use the entered values; this is not a forecast.'
      ]) {
        const paragraph=document.createElement('p');
        paragraph.textContent=line;
        output.append(paragraph);
      }
    } catch {
      input.setAttribute('aria-invalid','true');
      error.textContent=INPUT_ERROR;
    }
  }
  form.addEventListener('submit',event=>{event.preventDefault();calculate();});
  form.querySelector('[data-stat-reset]').addEventListener('click',()=>{input.value='2, 4, 4, 5, 25';calculate();});
  form.hidden=false;
  if (fallback) fallback.hidden=true;
  calculate();
}
