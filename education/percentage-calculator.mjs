import {combinePercentages} from './percentage-calculations.mjs';
import {formatStatistic as fmt} from './statistics-calculations.mjs';
import {createCopyResult} from './copy-result.mjs';
const form=document.querySelector('[data-percentage-form]');
if(form){
  const output=document.querySelector('[data-percentage-output]'),error=document.querySelector('[data-percentage-error]');
  const copy=createCopyResult(document.querySelector('[data-percentage-copy]'));
  const rate=value=>value===null?'Unavailable (zero attempts)':fmt(value)+'%';
  function invalidate(){output.replaceChildren();error.textContent='';copy.set('');}
  function calculate(){
    invalidate();form.querySelectorAll('input').forEach(input=>input.removeAttribute('aria-invalid'));
    try{
      const result=combinePercentages(['a','b'].map(name=>({made:form.elements[`${name}-made`].value,attempted:form.elements[`${name}-attempted`].value})));
      const lines=result.groups.map((group,index)=>`Group ${index?'B':'A'}: ${fmt(group.made)} made ÷ ${fmt(group.attempted)} attempts; ${rate(group.rate)}.`);
      lines.push(`Unweighted mean of group percentages: ${result.mean===null?'Unavailable: both groups need attempts.':`(${rate(result.groups[0].rate)} + ${rate(result.groups[1].rate)}) ÷ 2 = ${rate(result.mean)}`}`);
      lines.push(`Combined: (${fmt(result.groups[0].made)} + ${fmt(result.groups[1].made)}) ÷ (${fmt(result.groups[0].attempted)} + ${fmt(result.groups[1].attempted)}) × 100 = ${rate(result.combined)}. Total: ${fmt(result.made)} made / ${fmt(result.attempted)} attempts.`);
      lines.push('Use the same shot definition and non-overlapping records. Display rounded to four decimal places. These are summaries, not predictions.');
      for(const line of lines){const p=document.createElement('p');p.textContent=line;output.append(p);}
      copy.set('Combined percentage comparison\n'+lines.join('\n'));
    }catch(issue){
      const field=form.elements[`${issue.index?'b':'a'}-${issue.field||'made'}`];field.setAttribute('aria-invalid','true');
      error.textContent=`Group ${issue.index?'B':'A'}: ${issue.message}`;field.focus();
    }
  }
  form.addEventListener('input',invalidate);
  form.addEventListener('submit',event=>{event.preventDefault();calculate();});
  form.querySelector('[data-percentage-reset]').addEventListener('click',()=>{form.reset();calculate();});
  form.hidden=false;document.querySelector('[data-percentage-fallback]').hidden=true;calculate();
}
