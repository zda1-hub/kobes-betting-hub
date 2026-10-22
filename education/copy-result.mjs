/** Clipboard writes happen only after the reader activates Copy result. */
export function createCopyResult(container, clipboard = navigator.clipboard) {
  const button=document.createElement('button');
  button.type='button'; button.textContent='Copy result'; button.disabled=true;
  const status=document.createElement('p'); status.setAttribute('role','status');
  const manual=document.createElement('textarea'); manual.readOnly=true; manual.hidden=true; manual.rows=6;
  manual.setAttribute('aria-label','Result text for manual copying');
  let summary='', revision=0;
  button.addEventListener('click',async()=>{
    if(!summary)return;
    const text=summary, current=revision;
    button.disabled=true;
    try {
      if(!clipboard?.writeText)throw new Error('Clipboard unavailable');
      await clipboard.writeText(text);
      if(current===revision){status.textContent='Result copied.';manual.hidden=true;}
    } catch {
      if(current===revision){status.textContent='Clipboard unavailable. Select and copy the result text below.';manual.value=text;manual.hidden=false;manual.focus();manual.select();}
    } finally {if(current===revision)button.disabled=!summary;}
  });
  container.append(button,status,manual);
  return {set(text){revision++;summary=text;button.disabled=!text;status.textContent='';manual.value='';manual.hidden=true;}};
}
