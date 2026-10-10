(() => {
  const home = document.body.classList.contains('home-page');
  const main = document.querySelector('main');
  if (!main || (!home && !document.body.hasAttribute('data-membership-route'))) return;
  const card = home ? main.querySelector('.membership-card-promo') : document.createElement('a');
  if (!card) return;
  if (!home) {
    card.className='membership-card-promo'; card.href='/join';
    card.innerHTML='<img src="/assets/membership/kbh-vip-user-master-560.webp" srcset="/assets/membership/kbh-vip-user-master-560.webp 560w, /assets/membership/kbh-vip-user-master-1120.webp 1120w" sizes="(max-width:600px) 75vw, 870px" alt="KBH VIP member card — join for $32.99 per month" width="4200" height="2448"><span>$32.99/month until canceled. View membership →</span>';
    main.prepend(card);
  }
  const bill = main.querySelector('.referral-promo-banner');
  if(bill&&!home)bill.hidden=true;
  const scene = document.createElement('section'); scene.className='membership-scene'; scene.id='membership-view'; scene.dataset.open='false';
  card.before(scene); scene.append(card); if(bill) scene.append(bill);
  const panel=document.createElement('div'); panel.className='scene-panel'; panel.hidden=true;
  panel.innerHTML=`<div class="scene-nav"><a class="scene-back" href="/" data-membership-back>← Back to the Hub</a><span class="scene-note">ONE MEMBERSHIP. THE WHOLE HUB.</span></div>
  <section class="scene-confirmation" data-membership-confirmation hidden aria-live="polite"><h2 data-connection-title>Connect your Discord.</h2><p data-connection-message></p><a class="button scene-primary" data-discord-connect hidden aria-hidden="true">Connect Discord →</a><a href="/support">Get help</a><p>Already paid? Use the same Discord account. Do not purchase again.</p></section>
  <article class="scene-monthly" data-membership-sales><div><h1 tabindex="-1" id="membership-heading">Your KBH membership.</h1><p><strong>$32.99/month</strong> until canceled.</p></div><button class="button scene-primary" type="button" data-checkout="monthly" data-primary-membership-checkout>Join monthly →</button><p class="scene-terms" data-primary-membership-terms>$32.99 today, then $32.99/month. No free trial.</p></article>
  <p class="scene-tools" data-membership-sales>Expert plays · Detailed writeups · Arbitrage tools</p>
  <p class="scene-status" data-checkout-message role="status" aria-live="polite">Secure checkout with Stripe. VIP access connects to Discord.</p>
  <div class="scene-other" data-membership-sales><h2>Want a longer run?</h2><div class="scene-options">
  <article class="scene-plan"><div class="scene-plan-top"><h3>Six months</h3><span>KBH</span></div><p class="scene-price">$134.99 <small>today</small></p><p>Then $134.99 / 6 months until canceled.</p><div class="scene-plan-actions"><button class="button" type="button" data-checkout="six_month">Choose 6 months →</button></div></article>
  <article class="scene-plan"><div class="scene-plan-top"><h3>One year</h3><span>KBH</span></div><p class="scene-price">$194.99 <small>today</small></p><p>Then $194.99/year until canceled.</p><div class="scene-plan-actions"><button class="button" type="button" data-checkout="annual">Choose one year →</button></div></article>
  <article class="scene-plan scene-starter"><div class="scene-plan-top"><h3>Seven days</h3><span>KBH</span></div><p class="scene-price">$10 <small>today</small></p><p>First 7 days, then $32.99/month until canceled. No free trial.</p><button class="button" type="button" data-checkout="starter">Start 7 days →</button></article>
  </div><p class="scene-terms">All plans renew automatically. No free trial.</p></div>
  <details class="scene-included" data-membership-sales><summary>What’s included <span aria-hidden="true">+</span></summary><div><p>Expert picks, Kobe’s research and detailed writeups, arbitrage software, sport-specific channels, NFL and MLB injury reports, educational resources and the VIP community.</p><p>Arbitrage depends on live odds, accepted stakes and matching settlement rules. No outcome or profit is guaranteed.</p></div></details>
  <div class="scene-footer"><a href="/managemembership">Already a member? Manage membership →</a><p>Cancel before renewal; access continues through your paid-through date. Charges are non-refundable except where required by law, card-network rules or a written Hub exception. <a href="/terms">Membership terms</a> · <a href="/support">Support</a></p><p>21+ where permitted. Wager responsibly.</p></div>`;
  scene.append(panel);
  // Referral rewards apply to monthly memberships; keep the other offers private on referral arrivals.
  const arrival=new URLSearchParams(location.search);
  const referral=(arrival.get('ref') || '').toUpperCase();
  if(/^(KBH|KBC)-[A-Z0-9]{10}$/.test(referral) && !arrival.has('checkout')) panel.querySelector('.scene-other').hidden=true;
  const image=card.querySelector('img');
  const controls=[...document.querySelectorAll('a[href]')].filter(a=>{try{const url=new URL(a.href,location.href);return url.origin===location.origin&&url.hash!=='#main-content'&&/^\/(join|membership)(\.html)?$/.test(url.pathname);}catch{return false;}});
  const originalHidden=new Map(); let opened=false,opener=null,revision=0;
  const animations=new Set();
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate=(el,frames,options={})=>{
    if(!el || reduced())return Promise.resolve();
    const a=el.animate(frames,{duration:520,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards',...options});animations.add(a);
    return a.finished.catch(()=>{}).finally(()=>animations.delete(a));
  };
  const cancel=()=>{animations.forEach(a=>a.cancel());animations.clear();};
  const updateTriggers=()=>controls.forEach(a=>{a.setAttribute('aria-controls',scene.id);a.setAttribute('aria-expanded',String(opened));});
  const hideHome=()=>{
    if(!home)return;
    for(const child of main.children){if(child===scene)continue;if(!originalHidden.has(child))originalHidden.set(child,child.hidden);child.hidden=true;}
  };
  const restoreHome=()=>{for(const [child,hidden] of originalHidden)child.hidden=hidden;originalHidden.clear();};
  const align=()=>{
    const top=scene.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().height-16;
    window.scrollTo({top:Math.max(0,top),behavior:reduced()?'auto':'smooth'});
  };
  const open=async(trigger,push=true)=>{
    if(opened){align();return;}
    opened=true;opener=trigger;const current=++revision;cancel();scene.dataset.phase='opening';
    const before=image.getBoundingClientRect();
    const billBefore=bill&&!bill.hidden?bill.getBoundingClientRect():null;
    hideHome();panel.hidden=false;scene.dataset.open='true';card.removeAttribute('href');card.setAttribute('tabindex','-1');updateTriggers();
    if(home&&push)history.pushState({...history.state,kbhMembership:true},'',location.href);
    if(billBefore){bill.style.top=(billBefore.top-scene.getBoundingClientRect().top)+'px';bill.style.width=billBefore.width+'px';}
    const after=image.getBoundingClientRect();
    const cardMotion=animate(image,[{transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scale(${before.width/after.width})`},{transform:'none'}],{duration:640});
    if(billBefore)animate(bill,[{opacity:1,transform:'translate(-50%,0)'},{opacity:0,transform:'translate(-50%,90px)'}],{duration:320}).then(()=>{if(current===revision&&opened)bill.hidden=true;});
    animate(panel,[{opacity:0,transform:'translateY(28px)'},{opacity:1,transform:'translateY(0)'}],{delay:150});
    const planMotions=[...panel.querySelectorAll('.scene-plan')].map((p,i)=>animate(p,[{opacity:0,transform:'translateY(52px) rotate(1deg)'},{opacity:1,transform:'translateY(0) rotate(0)'}],{delay:220+i*65,duration:560}));
    panel.querySelector('h1').focus({preventScroll:true});align();
    await Promise.all([cardMotion,...planMotions]);if(current===revision&&opened)scene.dataset.phase='open';
  };
  const close=async()=>{
    if(!home||!opened)return;
    opened=false;const current=++revision;cancel();scene.dataset.phase='closing';
    await animate(panel,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(24px)'}],{duration:230});
    if(current!==revision||opened)return;
    const before=image.getBoundingClientRect();panel.hidden=true;scene.dataset.open='false';scene.dataset.phase='restoring';restoreHome();
    const returnMotions=[];
    card.href='/join';card.removeAttribute('tabindex');if(bill){bill.hidden=false;bill.style.top='';bill.style.width='';returnMotions.push(animate(bill,[{opacity:0,transform:'translateY(50px)'},{opacity:1,transform:'translateY(0)'}],{duration:480}));}
    updateTriggers();const after=image.getBoundingClientRect();returnMotions.push(animate(image,[{transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scale(${before.width/after.width})`},{transform:'none'}]));
    opener?.focus({preventScroll:true});
    await Promise.all(returnMotions);if(current===revision&&!opened)scene.dataset.phase='closed';
  };
  document.addEventListener('click',event=>{
      const a=event.target.closest('a[href]');if(!a||!controls.includes(a)||a.closest('.october-offer-overlay')||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();open(a);
    });
  if(home){
    panel.querySelector('[data-membership-back]').addEventListener('click',event=>{event.preventDefault();if(history.state?.kbhMembership)history.back();else close();});
    window.addEventListener('popstate',()=>{if(history.state?.kbhMembership)open(null,false);else close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened&&!document.querySelector('[role="dialog"]:not([hidden]):not([aria-hidden="true"])')){event.preventDefault();if(history.state?.kbhMembership)history.back();else close();}});
    if(history.state?.kbhMembership)open(null,false);
  }else open(null,false);
  const detail=panel.querySelector('details'),summary=detail.querySelector('summary');let disclosure;
  summary.addEventListener('click',event=>{
    if(reduced())return;event.preventDefault();disclosure?.cancel();const wasOpen=detail.open,from=detail.getBoundingClientRect().height;detail.open=true;const to=wasOpen?summary.getBoundingClientRect().height:detail.getBoundingClientRect().height;
    disclosure=detail.animate([{height:from+'px'},{height:to+'px'}],{duration:380,easing:'cubic-bezier(.22,1,.36,1)'});detail.style.overflow='hidden';disclosure.onfinish=()=>{detail.open=!wasOpen;detail.style.overflow='';};
  });
})();
