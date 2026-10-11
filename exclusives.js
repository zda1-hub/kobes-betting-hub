(() => {
  const input = document.getElementById('capper-search');
  const rail = document.getElementById('lineup-rail');
  if (!input || !rail) return;
  const rows = [...document.querySelectorAll('[data-capper-row]')];
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
    const matches = rows.filter(row => normalize(row.querySelector('th').textContent).includes(query));
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
})();
