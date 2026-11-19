(() => {
  const API='https://bettinghub-publisher.kobedirwin.workers.dev/api/truck/wall';
  const referralMenu=[...document.querySelectorAll('.site-menu a')].find(a=>a.getAttribute('href')==='refer.html');
  if(referralMenu) referralMenu.textContent='Referral program';
  async function update() {
    try {
      const response=await fetch(API,{mode:'cors'});
      if(!response.ok) return;
      const data=await response.json();
      const spot=Math.max(0,Number(data.spot)||0);
      const label=document.querySelector('[data-spot]');
      if(label) label.textContent=`spot ${spot} of 200`;
      const meter=document.querySelector('[data-progress]');
      if(meter) meter.setAttribute('aria-valuenow',String(Math.min(200,spot)));
      const fill=document.querySelector('[data-progress-fill]');
      if(fill) fill.style.width=`${Math.min(100,spot/200*100)}%`;
      for(const tier of ['Hood Club','Door Squad','Road Crew','Rider']) {
        const container=document.querySelector(`[data-tier="${tier}"]`);
        if(!container) continue;
        const rows=(data.rows||[]).filter(row=>row.tier===tier);
        if(!rows.length) continue;
        container.replaceChildren(...rows.map(row=>{
          const span=document.createElement('span'); span.textContent=row.name;return span;
        }));
      }
    } catch { /* Keep the honest zero-state if the API is unavailable. */ }
  }
  update();
})();
