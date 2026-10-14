(() => {
  const input = document.getElementById('capper-search');
  const rail = document.getElementById('lineup-rail');
  if (!input || !rail) return;
  const rows = [...document.querySelectorAll('[data-capper-row]')];
  const names = new Map(rows.map(row => [row,row.querySelector('th').textContent.trim()]));
  const sourceName = row => names.get(row);
  rows.sort((a,b) => sourceName(a).localeCompare(sourceName(b),'en',{sensitivity:'base',numeric:true}));
  rows.forEach((row,index) => { row.querySelector('.capper-number').textContent = String(index+1).padStart(3,'0'); row.parentElement.append(row); });
  const count = document.getElementById('directory-count');
  const empty = document.getElementById('directory-empty');
  const controls = document.querySelector('[data-directory-controls]');
  const previous = document.querySelector('[data-directory-previous]');
  const next = document.querySelector('[data-directory-next]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const updateControls = () => {
    previous.disabled = rail.scrollLeft <= 1;
    next.disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 1;
  };
  const move = direction => rail.scrollBy({left:direction * rail.clientWidth * .85,behavior:reduced.matches?'instant':'smooth'});
  const render = () => {
    const query = normalize(input.value);
    const matches = rows.filter(row => normalize(sourceName(row)).includes(query));
    const visible = new Set(matches);
    rows.forEach(row => row.hidden = !visible.has(row));
    count.textContent = `${matches.length} expert source${matches.length === 1 ? '' : 's'}`;
    empty.hidden = matches.length !== 0;
    rail.hidden = controls.hidden = matches.length === 0;
    rail.scrollTo({left:0,behavior:'instant'});
    updateControls();
  };
  input.addEventListener('input',render);
  previous.addEventListener('click',()=>move(-1));
  next.addEventListener('click',()=>move(1));
  rail.addEventListener('scroll',updateControls,{passive:true});
  window.addEventListener('resize',updateControls);
  rail.addEventListener('keydown',event=>{
    if (['ArrowLeft','ArrowRight','PageUp','PageDown'].includes(event.key)) {
      event.preventDefault();move(['ArrowLeft','PageUp'].includes(event.key)?-1:1);
    } else if (event.key==='Home' || event.key==='End') {
      event.preventDefault();rail.scrollTo({left:event.key==='Home'?0:rail.scrollWidth,behavior:reduced.matches?'instant':'smooth'});
    }
  });
  // Vertical mouse wheels browse the rail only while it can consume movement.
  // Trackpad horizontal gestures and scrolling past either end remain native.
  rail.addEventListener('wheel',event=>{
    if(event.ctrlKey || event.shiftKey || Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rail.clientWidth:1);
    const end=rail.scrollWidth-rail.clientWidth;
    if((delta<0&&rail.scrollLeft<=0)||(delta>0&&rail.scrollLeft>=end-1)||end<=0)return;
    event.preventDefault();rail.scrollLeft+=delta;
  },{passive:false});
  let drag;
  rail.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0)return;
    drag={x:event.clientX,left:rail.scrollLeft,moved:false};
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(Math.abs(event.clientX-drag.x)>4){drag.moved=true;rail.classList.add('is-dragging');}
    if(drag.moved){event.preventDefault();rail.scrollLeft=drag.left+drag.x-event.clientX;}
  });
  const endDrag=()=>{drag=null;rail.classList.remove('is-dragging');};
  rail.addEventListener('pointerup',endDrag);
  rail.addEventListener('pointercancel',endDrag);
  rail.addEventListener('lostpointercapture',endDrag);
  render();
  const status = document.createElement('p');
  status.className = 'directory-record-status'; status.setAttribute('role','status');
  status.textContent = 'Loading previous-day verified records…'; count.after(status);
  const url = ['localhost','127.0.0.1','::1'].includes(location.hostname) ? '/preview-api/results' : 'https://bettinghub-publisher.kobedirwin.workers.dev/api/results';
  fetch(url,{cache:'no-store'}).then(response => { if (!response.ok) throw new Error('Results unavailable'); return response.json(); }).then(snapshot => {
    const summary = snapshot.expertRecords;
    if (!summary || !/^\d{4}-\d{2}-\d{2}$/.test(summary.date) || !Array.isArray(summary.experts)) throw new Error('Records unavailable');
    const key = name => name.toLowerCase().replace(/[^a-z0-9]/g,'');
    const records = new Map(summary.experts.map(record => [key(record.source),record]));
    rows.forEach(row => {
      const record = records.get(key(sourceName(row))), label = document.createElement('span');
      label.className = 'capper-record';
      const settled = record && record.wins + record.losses;
      const notes = record ? [record.pushes && `${record.pushes} push`,record.voids && `${record.voids} void`,record.pending && `${record.pending} pending`].filter(Boolean) : [];
      label.textContent = (settled ? `${record.wins}-${record.losses}` : 'No verified W/L') + (notes.length ? ` · ${notes.join(' · ')}` : '');
      label.title = `${summary.date} MST · Verified wins-losses; pending results excluded`;
      row.querySelector('th').append(label);
    });
    status.textContent = `${summary.date} MST · Verified W/L. Pending, pushes and voids are excluded.`;
  }).catch(() => { status.textContent = 'Previous-day verified records are temporarily unavailable.'; });
})();
