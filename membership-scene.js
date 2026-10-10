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
  panel.innerHTML=`<h1 class="scene-sr-only" tabindex="-1" id="membership-heading">KBH membership options</h1>
  <section class="scene-confirmation" data-membership-confirmation hidden aria-live="polite"><h2 data-connection-title>Connect your Discord.</h2><p data-connection-message></p><a class="button scene-primary" data-discord-connect hidden aria-hidden="true">Connect Discord →</a><a href="/support">Get help</a><p>Already paid? Use the same Discord account. Do not purchase again.</p></section>
  <article class="scene-monthly" data-membership-sales><p class="scene-promise">Cancel Anytime, No Commitment.</p><button class="button scene-primary" type="button" data-checkout="monthly" data-primary-membership-checkout>Join monthly →</button><p class="scene-terms" data-primary-membership-terms>$32.99 billed monthly.</p></article>
  <div class="scene-support"><p class="scene-tools" data-membership-sales>Expert plays · Detailed writeups · Arbitrage tools</p><p class="scene-status" data-checkout-message role="status" aria-live="polite">Secure checkout with Stripe. VIP access connects to Discord.</p></div>
  <section class="scene-other" data-membership-sales><h2>Want a longer run?</h2><div class="scene-plan-toggle" role="group" aria-label="Membership duration" data-selected="six_month"><span class="scene-toggle-thumb" aria-hidden="true"></span><button type="button" data-longer-plan="six_month" aria-pressed="true" aria-controls="longer-membership-plan">Six months</button><button type="button" data-longer-plan="annual" aria-pressed="false" aria-controls="longer-membership-plan">One year</button></div>
  <article class="scene-plan" id="longer-membership-plan"><div class="scene-plan-face" aria-live="polite" aria-atomic="true"><h3>KBH VIP</h3><p class="scene-price" data-longer-price>$134.99</p><p class="scene-renewal" data-longer-period>Billed every 6 months.</p></div><div class="scene-plan-actions"><button class="button" type="button" data-checkout="six_month" data-longer-checkout>Join six months →</button></div></article>
  <details class="scene-short-stay"><summary>Prefer seven days?</summary><article class="scene-starter"><p><strong>$10 today.</strong> First 7 days, then $32.99/month until canceled. No free trial.</p><button class="button" type="button" data-checkout="starter">Start 7 days →</button></article></details></section>
  <p class="scene-renewal-note" data-membership-sales>All plans renew automatically. No free trial.</p>
  <details class="scene-included" data-membership-sales><summary>What’s included <span aria-hidden="true">+</span></summary><div><p>Expert picks, Kobe’s research and detailed writeups, arbitrage software, sport-specific channels, NFL and MLB injury reports, educational resources and the VIP community.</p><p>Arbitrage depends on live odds, accepted stakes and matching settlement rules. No outcome or profit is guaranteed.</p></div></details>
  <div class="scene-footer"><div class="scene-management"><p>Already a member?</p><a class="button scene-manage" href="/managemembership">Manage membership →</a></div><p>Cancel before renewal; access continues through your paid-through date. Charges are non-refundable except where required by law, card-network rules or a written Hub exception. <a href="/terms">Membership terms</a> · <a href="/support">Support</a></p><p>21+ where permitted. Wager responsibly.</p></div>`;
  scene.append(panel);
  // Referral rewards apply to monthly memberships; keep the other offers private on referral arrivals.
  const arrival=new URLSearchParams(location.search);
  const referral=(arrival.get('ref') || '').toUpperCase();
  if(/^(KBH|KBC)-[A-Z0-9]{10}$/.test(referral) && !arrival.has('checkout')) panel.querySelector('.scene-other').hidden=true;
  const image=card.querySelector('img');
  const controls=[...document.querySelectorAll('a[href]')].filter(a=>{try{const url=new URL(a.href,location.href);return url.origin===location.origin&&url.hash!=='#main-content'&&/^\/(join|membership)(\.html)?$/.test(url.pathname);}catch{return false;}});
  const headerJoin=document.querySelector('.header-join');
  const headerLabel=headerJoin?.textContent,headerHref=headerJoin?.getAttribute('href');
  const originalHidden=new Map(); let opened=false,opener=null,revision=0;
  const animations=new Set();
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate=(el,frames,options={})=>{
    if(!el || reduced())return Promise.resolve();
    const a=el.animate(frames,{duration:520,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards',...options});animations.add(a);
    return a.finished.catch(()=>{}).finally(()=>animations.delete(a));
  };
  const cancel=()=>{animations.forEach(a=>a.cancel());animations.clear();};
  const updateTriggers=()=>{
    controls.forEach(a=>{a.setAttribute('aria-controls',scene.id);a.setAttribute('aria-expanded',String(opened));});
    if(headerJoin){headerJoin.toggleAttribute('data-membership-return',opened);headerJoin.textContent=opened?'Back to the Hub':headerLabel;headerJoin.setAttribute('href',opened?'/':headerHref);}
  };
  const longerOffers={
    six_month:{price:'$134.99',period:'Billed every 6 months.',button:'Join six months →'},
    annual:{price:'$194.99',period:'Billed yearly.',button:'Join one year →'}
  };
  const toggle=panel.querySelector('.scene-plan-toggle'),longerCheckout=panel.querySelector('[data-longer-checkout]');
  const planButtons=[...toggle.querySelectorAll('button')];let planMotion;
  planButtons.forEach(button=>button.addEventListener('click',()=>{
    const offer=button.dataset.longerPlan;
    if(longerCheckout.disabled || toggle.dataset.selected===offer)return;
    const values=longerOffers[offer];if(!values)return;
    planMotion?.cancel();toggle.dataset.selected=offer;
    planButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    panel.querySelector('[data-longer-price]').textContent=values.price;
    panel.querySelector('[data-longer-period]').textContent=values.period;
    longerCheckout.dataset.checkout=offer;longerCheckout.textContent=values.button;
    if(!reduced())planMotion=panel.querySelector('.scene-plan-face').animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:150,easing:'ease-in-out'});
  }));
  new MutationObserver(()=>planButtons.forEach(button=>{button.disabled=longerCheckout.disabled;})).observe(longerCheckout,{attributes:true,attributeFilter:['disabled']});
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
      if(a===headerJoin&&opened){if(!home)return;event.preventDefault();if(history.state?.kbhMembership)history.back();else close();return;}
      event.preventDefault();open(a);
    });
  if(home){
    window.addEventListener('popstate',()=>{if(history.state?.kbhMembership)open(null,false);else close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened&&!document.querySelector('[role="dialog"]:not([hidden]):not([aria-hidden="true"])')){event.preventDefault();if(history.state?.kbhMembership)history.back();else close();}});
    if(history.state?.kbhMembership)open(null,false);
  }else open(null,false);
  panel.querySelectorAll('details').forEach(detail=>{const summary=detail.querySelector('summary');let disclosure,targetOpen=detail.open;
  summary.addEventListener('click',event=>{
    if(reduced())return;event.preventDefault();const from=detail.getBoundingClientRect().height;targetOpen=disclosure?!targetOpen:!detail.open;disclosure?.cancel();detail.open=true;const to=targetOpen?detail.getBoundingClientRect().height:summary.getBoundingClientRect().height;
    disclosure=detail.animate([{height:from+'px'},{height:to+'px'}],{duration:380,easing:'cubic-bezier(.22,1,.36,1)'});detail.style.overflow='hidden';disclosure.onfinish=()=>{detail.open=targetOpen;detail.style.overflow='';disclosure=null;};
  });
  });
})();
