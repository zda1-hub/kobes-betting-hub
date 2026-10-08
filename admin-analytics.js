const config=window.__KBH_MEMBERSHIP_CONFIG__;const fragment=new URLSearchParams(location.hash.slice(1));let token=fragment.get('session')||localStorage.getItem('kbh.admin.session')||sessionStorage.getItem('kbh.admin.session')||'';if(token)localStorage.setItem('kbh.admin.session',token);if(fragment.get('session'))history.replaceState(null,'',location.pathname)
const login=document.querySelector('[data-login]'),status=document.querySelector('[data-status]'),dashboard=document.querySelector('[data-dashboard]');login.href=`${config.workerOrigin}/admin/login`;const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((c||0)/100),pct=n=>`${((n||0)*100).toFixed(1)}%`,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let currentRange='today',lastData=null,loadSequence=0;

const reportingTimeZone='America/Phoenix';
function reportingDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:reportingTimeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
function rangeLabel(range){const names={today:'Today',yesterday:'Yesterday','7d':'Last 7 days','30d':'Last 30 days',all:'All time',custom:'Custom'};const end=reportingDate(new Date(Date.parse(range.end)-1));return `${names[range.preset]||'Selected dates'} · ${range.start?`${reportingDate(range.start)} to ${end}`:`through ${end}`} · MST`}
function customRangeParams(start,end){
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  if(!start||!end)throw new Error('Choose both custom dates.');
  if(!valid(start)||!valid(end)||start>end)throw new Error('Choose a valid end date on or after the start date.');
  const first=new Date(`${start}T00:00:00-07:00`),until=new Date(Date.parse(`${end}T00:00:00-07:00`)+86400000);
  if(until-first>366*86400000)throw new Error('Choose a date range of 366 days or less.');
  return new URLSearchParams({range:'custom',start:first.toISOString(),end:until.toISOString()});
}
function memberInRange(member,range,scope){
  if(scope==='all'||range.preset==='all')return true;
  const joined=Date.parse(member.joinedAt);
  return Number.isFinite(joined)&&(!range.start||joined>=Date.parse(range.start))&&joined<Date.parse(range.end);
}
function selectedMetrics(d){return [['Revenue · selected dates',money(d.revenue.collectedCents)],['Memberships started · selected dates',d.membership.members.filter(m=>memberInRange(m,d.range,'range')).length],['Renewals · selected dates',d.membership.renewals],['Failed attempts · selected dates',d.revenue.failedPayments],['Affected customers',d.revenue.affectedCustomers],['Open failed invoices',d.revenue.openFailedInvoices],['Refunds · selected dates',money(d.revenue.refundsCents)],['Cancellations · selected dates',d.membership.actualCancellations]]}
function renderRange(d){
  document.querySelector('[data-range-summary]').textContent=rangeLabel(d.range);
  if(d.range.preset!=='custom'){
    document.querySelector('[data-start]').value=d.range.start?reportingDate(d.range.start):'';
    document.querySelector('[data-end]').value=reportingDate(new Date(Date.parse(d.range.end)-1));
  }
}
function selectRange(range){currentRange=range;const dates=document.querySelector('[data-custom-dates]');if(dates)dates.hidden=range!=='custom';document.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('active',b.dataset.range===range);b.setAttribute('aria-pressed',String(b.dataset.range===range))});return load()}

function rows(target,values){target.innerHTML=values.length?values.map(([a,b])=>`<div class="row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join(''):'<p class="muted">No data in this range.</p>'}
function metrics(target,values){target.innerHTML=values.map(([a,b])=>`<article class="metric"><span>${esc(a)}</span><strong>${esc(b)}</strong></article>`).join('')}
function renderInteractions(value){
  const v=value||{}, counts=v.byAction||{}, allCtas=v.ctas||[], allForms=v.forms||[];
  metrics(document.querySelector('[data-interaction-metrics]'),[
    ['CTA clicks',counts.cta_click||0],['Form starts',counts.form_start||0],
    ['Submit attempts',counts.form_submit_attempt||0],['Confirmed email signups',counts.generate_lead||0],
  ]);
  const campaignSelect=document.querySelector('[data-interaction-campaign]');
  const pageSelect=document.querySelector('[data-interaction-page]');
  const selectedCampaign=campaignSelect.value, selectedPage=pageSelect.value;
  const campaigns=[...new Set([...allCtas,...allForms].map(x=>x.campaign).filter(Boolean))].sort();
  const pages=[...new Set(allCtas.map(x=>x.path).filter(Boolean))].sort();
  campaignSelect.innerHTML='<option value="all">All campaigns</option>'+campaigns.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  pageSelect.innerHTML='<option value="all">All pages</option>'+pages.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(campaigns.includes(selectedCampaign))campaignSelect.value=selectedCampaign;
  if(pages.includes(selectedPage))pageSelect.value=selectedPage;
  const render=()=>{
    const campaign=campaignSelect.value,page=pageSelect.value;
    const ctas=allCtas.filter(x=>(campaign==='all'||x.campaign===campaign)&&(page==='all'||x.path===page));
    const forms=allForms.filter(x=>campaign==='all'||x.campaign===campaign);
    document.querySelector('[data-interaction-ctas]').innerHTML=ctas.length?ctas.slice(0,30).map(x=>`<div class="row"><span>${esc(x.id)} · ${esc(x.location)} · ${esc(x.path)} · ${esc(x.source)}/${esc(x.campaign)}</span><strong>${x.clicks} clicks · ${x.uniqueVisitors} visitors</strong></div>`).join(''):'<p class="muted">No CTA activity for this filter.</p>';
    document.querySelector('[data-interaction-forms]').innerHTML=forms.length?forms.map(x=>`<div class="row"><span>${esc(x.id)} · ${esc(x.source)}/${esc(x.campaign)}</span><strong>${x.views} views · ${x.starts} starts · ${x.attempts} attempts · ${x.errors} validation errors · ${x.leads} confirmed</strong></div>`).join(''):'<p class="muted">No email form activity for this filter.</p>';
  };
  campaignSelect.onchange=render;pageSelect.onchange=render;render();
}
function renderEngagement(value){
  const e=value||{}, sample=e.measuredSessions||0;
  metrics(document.querySelector('[data-engagement]'),[
    ['Measured visits',sample],['Avg foreground time',sample?`${Math.round(e.avgForegroundSeconds||0)}s`:'—'],
    ['Single-page visits',sample?pct(e.singlePageRate):'—'],['Quick exits',sample?pct(e.quickExitRate):'—'],
    ['Join-page samples',e.joinSamples||0],['Avg join-page time',e.joinSamples?`${Math.round(e.joinAvgForegroundSeconds||0)}s`:'—'],
    ['Avg max join scroll',e.joinSamples?`${Math.round(e.joinAvgMaxScrollPct||0)}%`:'—'],
  ]);
  for(const device of ['mobile','desktop']){
    const target=document.querySelector(`[data-heatmap-${device}]`);
    const cells=e.heatmap?.[device]||[];
    const max=Math.max(1,...cells);
    target.innerHTML=Array.from({length:144},(_,index)=>{
      const count=Number(cells[index])||0;
      return `<span title="${count} click${count===1?'':'s'}" style="--heat:${count?Math.max(.12,count/max):0}"></span>`;
    }).join('');
  }
}
function time(value){return value?new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'No verified time'}
function pacificDate(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(x=>x.type===t)?.value;return `${part('year')}-${part('month')}-${part('day')}`}
function setupCampaignLinks(){const source=document.querySelector('[data-link-source]'),page=document.querySelector('[data-link-page]'),campaign=document.querySelector('[data-link-campaign]'),content=document.querySelector('[data-link-content]'),output=document.querySelector('[data-tracking-link]'),copy=document.querySelector('[data-copy-tracking-link]'),message=document.querySelector('[data-link-status]');if(!source||!page||!campaign||!content||!output||!copy)return;const slug=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80);const update=()=>{const url=new URL(page.value,'https://kobesbettinghub.com');url.searchParams.set('utm_source',source.value);url.searchParams.set('utm_medium',['instagram','tiktok','x','youtube','facebook'].includes(source.value)?'organic_social':source.value==='discord'?'community':source.value);url.searchParams.set('utm_campaign',slug(campaign.value)||'general');const creative=slug(content.value);if(creative)url.searchParams.set('utm_content',creative);output.textContent=url.toString();message.textContent='';return url.toString()};[source,page,campaign,content].forEach(control=>control.addEventListener(control.tagName==='INPUT'?'input':'change',update));copy.addEventListener('click',async()=>{const value=update();try{await navigator.clipboard.writeText(value);message.textContent='Copied. Use this exact link on that platform.'}catch{message.textContent='Copy failed. Select the link above and copy it manually.'}});update()}
function setupCreatorInvite(){const name=document.querySelector('[data-creator-name]'),email=document.querySelector('[data-creator-email]'),create=document.querySelector('[data-create-creator]'),result=document.querySelector('[data-creator-result]'),link=document.querySelector('[data-creator-link]'),copy=document.querySelector('[data-copy-creator-link]'),message=document.querySelector('[data-creator-status]');if(!name||!email||!create)return;create.onclick=async()=>{const creatorName=name.value.trim(),creatorEmail=email.value.trim().toLowerCase();if(creatorName.length<2||!creatorEmail.includes('@')){message.textContent='Enter the creator name and verified email.';return}create.disabled=true;message.textContent='Creating tracked creator access…';try{const response=await fetch(`${config.workerOrigin}/admin/creators`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name:creatorName,email:creatorEmail})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Creator invite failed.');link.textContent=data.onboardingUrl;result.hidden=false;message.textContent=`Tracked creator created · ${data.status}. Temporary access starts after Discord email verification.`;await load()}catch(error){message.textContent=error.message}finally{create.disabled=false}};copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.textContent);message.textContent='Onboarding link copied.'}catch{message.textContent='Copy failed. Select the onboarding link and copy it manually.'}}}
function updatePickAttention(pick){
  const link=document.querySelector('[data-priority-alerts] a[href="#publishing-status"]');if(!link)return;
  const stale=pick&&pick.publishedDate!==pacificDate();
  const value=pick?(stale?'Not published':'Published'):'Unavailable';
  const note=pick?`Latest: ${pick.publishedDate}`:'Delivery status could not load';
  link.classList.toggle('urgent',Boolean(stale));
  link.innerHTML=`<span><strong>Today’s free pick</strong><small>${esc(note)}</small></span><b>${esc(value)}</b><span aria-hidden="true">↗</span>`;
}
function renderFreePick(pick){
  updatePickAttention(pick);
  const target=document.querySelector('[data-free-pick]');
  if(!pick){target.innerHTML='<p class="muted">Free Pick delivery information is temporarily unavailable.</p>';return}
  const d=pick.details||{},selection=[d.selection,d.line,d.odds].filter(Boolean).join(' ');
  const stale=pick.publishedDate!==pacificDate(),instagramPosted=pick.instagramStoryStatus==='published';
  const instagramLabel=stale?'No current-day post':instagramPosted?'Story posted':({
    not_connected:'Not connected',expired:'Connection expired',held:'Needs attention',
    publishing:'Publishing',processing:'Processing',pending:'Story pending',
    container_created:'Processing',creating_container:'Processing',not_ready:'Story not ready',unavailable:'Status unavailable'
  })[pick.instagramStoryStatus]||'Story pending';
  const instagramDetail=instagramPosted?time(pick.instagramStoryPublishedAt):
    pick.instagramStoryError||(!stale&&pick.instagramConnectionStatus==='connected'?'Story publisher checks every 5 minutes.':'Connect the official Instagram account before automation.');
  target.innerHTML=`${stale?`<div class="delivery-alarm"><strong>Today’s Free Pick is missing</strong><span>The latest verified pick is from ${esc(pick.publishedDate)}. Nothing should be claimed as posted today until a new approved pick is published.</span></div>`:''}<div class="pick-summary"><span>${esc(d.sport||pick.publishedDate||'Current pick')} · ${esc(pick.publishedDate||'')}</span><strong>${esc(selection||d.pick||'Pick details unavailable')}</strong><small>${esc(d.event||'')}</small></div><div class="delivery-grid"><article class="delivery ${!stale&&pick.websiteStatus==='published'?'ok':'warn'}"><span>WEBSITE</span><strong>${stale?'No current-day pick':pick.websiteStatus==='published'?'Live':'Needs attention'}</strong><small>${esc(time(pick.websitePublishedAt))}</small></article><article class="delivery ${!stale&&pick.xStatus==='published'?'ok':'warn'}"><span>X / TWITTER</span><strong>${stale?'No current-day post':pick.xStatus==='published'?'Posted':esc((pick.xStatus||'unavailable').replaceAll('_',' '))}</strong><small>${esc(time(pick.xPublishedAt))}</small>${pick.xPostId?`<a target="_blank" href="https://x.com/i/web/status/${esc(pick.xPostId)}">View latest post ↗</a>`:''}</article><article class="delivery ${!stale&&instagramPosted?'ok':'warn'}"><span>INSTAGRAM</span><strong>${esc(instagramLabel)}</strong><small>${esc(instagramDetail)}</small>${pick.storyUrl?`<a target="_blank" href="${esc(pick.storyUrl)}">Open latest Story asset ↗</a>`:''}</article></div>`;
}
async function refreshFreePick(fallback){if(fallback){renderFreePick(fallback);return}try{const r=await fetch('https://bettinghub-publisher.kobedirwin.workers.dev/api/free-pick/current');if(r.ok){renderFreePick(await r.json());return}}catch{}renderFreePick(null)}
async function retry(payload,button){button.disabled=true;const r=await fetch(`${config.workerOrigin}/admin/retry-vip`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});status.textContent=r.ok?'VIP sync completed. Refreshing…':(await r.json()).error;button.disabled=false;if(r.ok)load()}
function renderMembers(){if(!lastData)return;const q=document.querySelector('[data-member-search]').value.toLowerCase(),filter=document.querySelector('[data-member-filter]').value;const scope=document.querySelector('[data-member-scope]').value;const values=lastData.membership.members.filter(m=>{if(!memberInRange(m,lastData.range,scope))return false;const isActive=['active','trialing'].includes(m.status),matches=!q||Object.values(m).some(v=>String(v||'').toLowerCase().includes(q));const state=filter==='all'||(filter==='active'&&isActive)||(filter==='monthly'&&isActive&&['trial_2_day','referral_trial'].includes(m.plan))||(filter==='starter'&&isActive&&m.plan==='starter')||(filter==='awaiting'&&isActive&&!m.discordUserId)||(filter==='canceling'&&m.canceling)||(filter==='expired'&&['canceled','incomplete_expired'].includes(m.status))||(filter==='failed'&&['past_due','unpaid'].includes(m.status))||(filter==='vip'&&isActive&&m.vipStatus!=='VIP_ACTIVE')||(filter==='duplicate'&&m.duplicate);return matches&&state});document.querySelector('[data-member-range]').textContent=scope==='all'?'All recorded memberships · date filter not applied':`Membership start date · ${rangeLabel(lastData.range)}`;document.querySelector('[data-members]').innerHTML=values.map(m=>`<tr class="${m.duplicate?'duplicate-member':''}"><td><strong>${esc(m.name||'Unnamed')}</strong>${m.duplicate?'<span class="duplicate-badge">Possible duplicate</span>':''}<br><span>${esc(m.email||'')}</span>${m.duplicateReasons?.length?`<small class="duplicate-reason">${esc(m.duplicateReasons.join(' · '))}</small>`:''}</td><td>${esc(m.plan)}${m.joinedAt?`<small class="member-attribution">Started ${esc(reportingDate(m.joinedAt))}</small>`:''}</td><td>${esc(m.canceling?'canceling':m.status)}</td><td>${esc(m.discordUserId||'Missing')}</td><td>${esc(m.vipStatus)}</td><td>${m.renewsOrEndsAt?new Date(m.renewsOrEndsAt).toLocaleDateString():'—'}${m.purchaseAt?`<small class="member-attribution">Purchased ${esc(new Date(m.purchaseAt).toLocaleDateString())}</small>`:''}</td><td><strong>${esc(m.firstSource||'direct')}</strong>${m.firstCampaign?`<small class="member-attribution">First: ${esc(m.firstCampaign)}</small>`:''}<small class="member-attribution">Last: ${esc(m.lastSource||m.firstSource||'direct')}${m.lastCampaign?` · ${esc(m.lastCampaign)}`:''}</small>${m.landingPage?`<small class="member-attribution">Landing: ${esc(m.landingPage)}</small>`:''}${m.referralSource?`<small class="member-attribution">Referral: ${esc(m.referralSource)}</small>`:''}</td><td>${money(m.referralCreditsCents)} paid<br>${money(m.pendingReferralCreditsCents)} pending</td><td><details><summary>View IDs</summary><code>${esc(m.stripeCustomerId)}</code><br><code>${esc(m.subscriptionId)}</code></details></td></tr>`).join('')||'<tr><td colspan="9">No matching members.</td></tr>'}
function render(d){lastData=d;renderEngagement(d.engagement);renderInteractions(d.interactions);login.hidden=true;dashboard.hidden=false;document.querySelector('[data-paid-without-vip]').textContent=d.discord.paidWithoutVip;document.querySelector('[data-access-watch-label]').textContent=d.discord.paidWithoutVip&&d.discord.paidDiscordMissing===d.discord.paidWithoutVip?'Paid members awaiting Discord connection':'Memberships needing VIP setup';renderRange(d);metrics(document.querySelector('[data-primary]'),selectedMetrics(d));metrics(document.querySelector('[data-metrics]'),[['Measured website visits',d.traffic.uniqueVisitors],['Join visits',d.traffic.joinVisitors],['Offer selections',d.conversion.offerSelections],['Discord connections',d.conversion.discordConnections],['Checkout starts',d.conversion.checkoutStarts],['Successful payments',d.conversion.successfulPayments],['Unattributed payments',d.conversion.unattributedPayments||0],['Checkout → purchase',pct(d.conversion.checkoutPurchaseConversionRate)],['Active monthly',d.membership.monthly],['$10 intro',d.membership.intro],['Six-month',d.membership.sixMonth],['Annual',d.membership.annual],['New MRR',money(d.revenue.newMrrCents)],['Lost MRR',money(d.revenue.lostMrrCents)],['Renewals',d.membership.renewals],['Scheduled cancels',d.membership.scheduledCancellations],['Failed attempts',d.revenue.failedPayments],['Failed invoices',d.revenue.failedInvoices],['Affected customers',d.revenue.affectedCustomers],['Open failed invoices',d.revenue.openFailedInvoices],['VIP activation',pct(d.conversion.vipActivationRate)],['VIP recoveries',d.discord.recovered],['VIP checks unavailable',d.discord.roleCheckUnavailable||0],['Referral visits',d.referrals.visits],['Qualified referrals',d.referrals.qualified],['Referral cash paid',money(d.referrals.paidCashCents)]]);
refreshFreePick(d.operations?.freePick);
const duplicates=d.membership.duplicateGroups||[];document.querySelector('[data-duplicate-count]').textContent=duplicates.length;document.querySelector('[data-duplicate-count]').classList.toggle('clear',!duplicates.length);document.querySelector('[data-duplicates]').innerHTML=duplicates.length?duplicates.map(x=>`<article class="duplicate-card ${x.risk==='high'?'high':''}"><div><span class="duplicate-badge">${x.risk==='high'?'High risk':'Review'}</span><strong>${esc(x.names?.join(' / ')||x.value)}</strong><p>${esc(x.reason)}</p><small>${esc(x.type)}: ${esc(x.value)} · ${x.activeSubscriptions} active subscription${x.activeSubscriptions===1?'':'s'} · ${x.customerIds.length} Stripe customer${x.customerIds.length===1?'':'s'}</small></div><details><summary>Show linked IDs</summary><code>${esc(x.customerIds.join('\n'))}</code><code>${esc(x.subscriptionIds.join('\n'))}</code>${x.discordIds.length?`<code>${esc(x.discordIds.join('\n'))}</code>`:''}</details></article>`).join(''):'<div class="duplicate-empty"><strong>No duplicate signals found</strong><span>Emails, Discord accounts, and active subscriptions look clean.</span></div>';
document.querySelector('[data-funnel]').innerHTML=d.conversion.funnel.map(x=>`<article><strong>${esc(x.name.replaceAll('_',' '))}</strong><b>${x.count}</b><span>${pct(x.previousConversionRate)} from prior · ${pct(x.overallConversionRate)} overall</span><small>${x.dropoff} drop-off (${pct(x.dropoffRate)})</small></article>`).join('');const max=Math.max(1,...d.history.map(x=>x.revenueCents));document.querySelector('[data-history]').innerHTML=d.history.map(x=>`<div title="${x.date}: ${money(x.revenueCents)}, ${x.newMembers} new"><i style="height:${Math.max(2,x.revenueCents/max*100)}%"></i></div>`).join('');
metrics(document.querySelector('[data-revenue]'),[['Today',money(d.revenue.todayCents)],['This week',money(d.revenue.weekCents)],['This month',money(d.revenue.monthCents)],['All time',money(d.revenue.allTimeCents)],['Intro offer revenue',money(d.revenue.introRevenueCents)],['Subscription revenue',money(d.revenue.subscriptionRevenueCents)],['Referral credits issued',money(d.referrals.paidCashCents)],['Refunds',money(d.revenue.refundsCents)],['Lost MRR',money(d.revenue.lostMrrCents)]]);
const access=document.querySelector('[data-access]');access.innerHTML=`<div class="row"><span>Paid + VIP Active</span><strong>${d.discord.vipActive}</strong></div><div class="row"><span>Paid + VIP Pending</span><strong>${d.discord.pending}</strong></div><div class="row"><span>Paid + VIP Failed</span><strong>${d.discord.failed}</strong></div><div class="row"><span>Successful recovery/retry</span><strong>${d.discord.recovered}</strong></div><div class="row"><span>Discord not connected</span><strong>${d.discord.paidDiscordMissing}</strong></div><div class="row"><span>VIP check unavailable</span><strong>${d.discord.roleCheckUnavailable||0}</strong></div><div class="row"><span>VIP Role + No Valid Entitlement</span><strong>${d.discord.vipWithoutEntitlement===null?'Unavailable':d.discord.vipWithoutEntitlement}</strong></div>`+d.discord.details.map(x=>`<div class="row danger"><span>${esc(x.plan)} · ${esc(x.roleCheck||x.vipStatus)} · attempts ${x.activationAttempts} · ${esc(x.failureReason||'no recorded failure')}</span>${x.roleCheck==='MISSING'&&x.discordConnected?`<button class="retry" data-association="${esc(x.associationId||'')}" data-subscription="${esc(x.subscriptionId)}">Retry VIP Sync</button>`:''}</div>`).join('');access.querySelectorAll('[data-subscription]').forEach(b=>b.onclick=()=>retry(b.dataset.association?{associationId:b.dataset.association}:{subscriptionId:b.dataset.subscription},b));
const issueDetails=[...d.alerts.awaitingDiscord.map(x=>`Awaiting Discord · ${x.id||x.stripe_subscription_id||'member'}`),...d.alerts.paidWithoutVip.map(x=>`${x.discordConnected?'VIP role missing':'Discord connection needed'} · ${x.subscriptionId} · ${x.failureReason||x.vipStatus}`),...d.alerts.webhookFailures.map(x=>`Webhook · ${x.event_type} · ${x.error_detail||'failed'}`),...d.alerts.failedPayments.map(x=>`Failed payment · ${x.stripe_subscription_id||x.stripe_customer_id||'member'}`),...d.alerts.referralReview.map(x=>`Referral review · ${x.referrer_discord_user_id||'unknown'}`)];document.querySelector('[data-alerts]').innerHTML=`<div class="row"><span>Total issues</span><strong>${d.alerts.total}</strong></div>`+(issueDetails.length?issueDetails.map(x=>`<div class="row danger"><span>${esc(x)}</span></div>`).join(''):'<p class="muted">No issues in this range.</p>');document.querySelector('[data-sources]').innerHTML=d.traffic.sources.map(x=>`<tr><td>${esc(x.source)}</td><td>${x.visitors}</td><td>${x.joinViews}</td><td>${x.checkoutStarts}</td><td>${x.purchases}</td><td>${pct(x.conversionRate)}</td><td>${money(x.revenueCents)}</td><td>${money(x.mrrCents)}</td></tr>`).join('');rows(document.querySelector('[data-countries]'),Object.entries(d.traffic.countries));rows(document.querySelector('[data-devices]'),Object.entries(d.traffic.devices));rows(document.querySelector('[data-browsers]'),Object.entries(d.traffic.browsers));document.querySelector('[data-campaigns]').innerHTML=d.traffic.campaigns.length?d.traffic.campaigns.map(x=>`<div class="campaign-row"><strong>${esc(x.source)} · ${esc(x.campaign)}</strong><span>${x.visitors} visits · ${x.checkoutStarts} checkout${x.checkoutStarts===1?'':'s'} · ${x.purchases} paid · ${pct(x.conversionRate)} · ${money(x.revenueCents)} revenue · ${money(x.mrrCents)} MRR</span></div>`).join(''):'<p class="muted">No campaign data in this range.</p>';metrics(document.querySelector('[data-retention]'),[['Renewal rate',pct(d.retention.renewalRate)],['Churn rate',pct(d.retention.churnRate)],['Average duration',`${d.retention.averageDurationDays.toFixed(1)} days`],['Intro → monthly',pct(d.retention.starterToMonthlyRate)],['Active 30+ days',d.retention.active30Days],['Active 60+ days',d.retention.active60Days],['Active 90+ days',d.retention.active90Days],['First-week cancels',d.retention.firstWeekCancellations],['First-month cancels',d.retention.firstMonthCancellations],['Retention offers shown',d.retention.offersShown],['Retention offers accepted',d.retention.offersAccepted]]);rows(document.querySelector('[data-reasons]'),Object.entries(d.retention.cancellationReasons));document.querySelector('[data-referrals]').innerHTML=d.referrals.leaderboard.map(x=>`<tr><td>${esc(x.referralCode)}</td><td>${esc(x.referrerName||x.discordUserId)}</td><td>${x.successfulReferrals}</td><td>${x.pendingReferrals}</td><td>${pct(x.conversionRate)}</td><td>${money(x.totalEarnedCents)}</td></tr>`).join('')||'<tr><td colspan="6">No referral activity.</td></tr>';renderMembers();status.textContent=`Updated ${new Date(d.generatedAt).toLocaleString('en-US',{timeZone:reportingTimeZone})} MST`}
function renderOverview(d){
  const target=document.querySelector('[data-summary]'),attention=document.querySelector('[data-priority-alerts]');
  if(!target||!attention||!d.scoreboard||!d.revenue||!d.conversion||!d.traffic)return;
  const count=value=>Number.isFinite(value)?String(value):'Unavailable';
  const cash=value=>Number.isFinite(value)?money(value):'Unavailable';
  const ratio=value=>Number.isFinite(value)?pct(value):'Unavailable';
  const items=[
    ['Active subscriptions',count(d.scoreboard.activePaid),'Right now','blue'],
    ['Estimated MRR',cash(d.scoreboard.mrrCents),'Monthly recurring · now','ink'],
    ['Collected revenue',cash(d.revenue.collectedCents),'Selected dates',''],
    ['Successful payments',count(d.conversion.successfulPayments),'Selected dates',''],
    ['Measured visits',count(d.traffic.uniqueVisitors),'Consented 30-minute browsing sessions',''],
    ['Checkout → paid',ratio(d.conversion.checkoutPurchaseConversionRate),`${count(d.conversion.successfulPayments)} payments / ${count(d.conversion.checkoutStarts)} checkout starts`,'']
  ];
  target.innerHTML=items.map(([label,value,note,tone])=>`<article class="metric hero-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  const signal=document.querySelector('[data-conversion-signal]');
  const steps=(d.conversion.funnel||[]).slice(1).filter(step=>Number.isFinite(step.dropoffRate)&&step.dropoff>0);
  const biggest=steps.sort((a,b)=>b.dropoffRate-a.dropoffRate)[0];
  if(signal){signal.hidden=!biggest;if(biggest)signal.textContent=`Largest funnel drop-off: ${String(biggest.name).replaceAll('_',' ')} · ${pct(biggest.dropoffRate)} from the previous step.`;}
  const pick=d.operations?.freePick;
  const stale=pick&&pick.publishedDate!==pacificDate();
  const actions=[
    ['Open failed invoices',d.revenue.openFailedInvoices,'Selected dates · review Stripe invoices','membership-report','payment-issues',''],
    ['Paid without VIP setup',d.discord?.paidWithoutVip,'Current access checks','membership-report','access-health',''],
    ['VIP checks unavailable',d.discord?.roleCheckUnavailable,'Verify access before taking action','membership-report','access-health',''],
    ['Today’s free pick',pick?(stale?'Not published':'Published'):'Unavailable',pick?`Latest: ${pick.publishedDate}`:'Delivery status could not load','publishing-report','publishing-status','']
  ];
  attention.innerHTML=actions.map(([label,value,note,section,id])=>`<a class="attention-item ${typeof value==='number'&&value>0||value==='Not published'?'urgent':''}" href="#${id}" data-open-section="${section}"><span><strong>${esc(label)}</strong><small>${esc(note)}</small></span><b>${esc(typeof value==='number'?count(value):value??'Unavailable')}</b><span aria-hidden="true">↗</span></a>`).join('');
  const refresh=document.querySelector('[data-refresh]');if(refresh)refresh.hidden=false;
}
function labelMobileTables(){
  document.querySelectorAll('.table-wrap table').forEach(table=>{
    const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent);
    table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>{
      if(cell.colSpan>1)cell.setAttribute('data-label','');
      else cell.setAttribute('data-label',labels[i]||'');
    }));
  });
}
function setupDashboardNavigation(){
  document.querySelector('[data-refresh]')?.addEventListener('click',()=>load());
  dashboard.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href^="#"]');if(!link)return;
    const id=link.getAttribute('href').slice(1),target=document.getElementById(id);if(!target)return;
    const details=target.tagName==='DETAILS'?target:target.closest('details.dashboard-details');
    event.preventDefault();
    if(details)details.open=true;
    if(link.dataset.openSection){const group=document.getElementById(link.dataset.openSection);if(group)group.open=true;}
    history.replaceState(null,'',`#${id}`);
    target.scrollIntoView({block:'start',behavior:'instant'});
  });
}

function renderExecutive(d){
  const s=d.scoreboard;
  if(!s)return;
  metrics(document.querySelector('[data-current]'),[['Active subscriptions · now',s.activePaid],['Estimated MRR · now',money(s.mrrCents)],['New paid today',s.newPaidToday],['Cancelled today',s.cancelledToday??'Unavailable'],['Net adds today',s.netAddsToday??'Unavailable'],['New paid · last 7 days',s.newPaidLast7]]);
}
function renderTarget(d){
  const s=d.scoreboard;
  if(!s)return;
  const remaining=Math.max(0,1000-s.activePaid),deadline=Date.parse('2027-01-01T07:00:00Z');
  const days=Math.max(1,(deadline-Date.parse(d.generatedAt))/86400000);
  const avg=s.netAddsLast7===null?null:s.netAddsLast7/7,required=remaining/days;
  const milestones=[25,50,100,250,500,750,1000].map(goal=>`${goal}${s.activePaid>=goal?' ✓':''}`).join(' · ');
  metrics(document.querySelector('[data-target]'),[['Remaining',remaining],['Net adds · last 7 days',s.netAddsLast7??'Unavailable'],['Average net adds/day · last 7',avg===null?'Unavailable':avg.toFixed(2)],['Required net adds/day by Dec 31',required.toFixed(2)],['Milestones',milestones]]);
}
function renderPaymentAndReferralDetails(d){
  const failed=d.alerts.failedPayments||[];
  const other=[...(d.alerts.awaitingDiscord||[]).map(x=>`Awaiting Discord · ${x.id||x.stripe_subscription_id||'member'}`),...(d.alerts.paidWithoutVip||[]).map(x=>`${x.discordConnected?'VIP role missing':'Discord connection needed'} · ${x.subscriptionId}`),...(d.alerts.vipCheckUnavailable||[]).map(x=>`VIP check unavailable · ${x.subscriptionId}`),...(d.alerts.webhookFailures||[]).map(x=>`Webhook · ${x.event_type}`),...(d.alerts.referralReview||[]).map(x=>`Referral review · ${x.referrer_discord_user_id||'unknown'}`)];
  document.querySelector('[data-alerts]').innerHTML=`<div class="row"><span>Total issues</span><strong>${d.alerts.total}</strong></div>`+failed.map(x=>{const invoice=x.invoiceId&&/^in_[A-Za-z0-9]+$/.test(x.invoiceId)?`https://dashboard.stripe.com/invoices/${x.invoiceId}`:'';const customer=x.customerId&&/^cus_[A-Za-z0-9]+$/.test(x.customerId)?`https://dashboard.stripe.com/customers/${x.customerId}`:'';return `<details class="row danger"><summary>${x.recovered?'Recovered':'Payment due'} · ${esc(x.name||x.email||x.customerId||'member')} · ${money(x.amountCents)} · ${x.attemptCount} attempt${x.attemptCount===1?'':'s'}</summary><div class="alert-detail">${esc(x.email||'Email unavailable')} · ${esc(x.membershipStatus||'unknown status')}<br>${esc(time(x.occurredAt))} · ${x.recovered?'Paid after failure':'Awaiting recovery'} · Decline reason: inspect Stripe${invoice?` · <a href="${invoice}" target="_blank" rel="noopener">Stripe invoice ↗</a>`:''}${customer?` · <a href="${customer}" target="_blank" rel="noopener">Customer ↗</a>`:''}<br><small>Stripe ID: ${esc(x.subscriptionId||x.customerId||'unavailable')}</small></div></details>`}).join('')+other.map(x=>`<div class="row danger"><span>${esc(x)}</span></div>`).join('');
  document.querySelector('[data-referral-links]').innerHTML=(d.referrals.links||[]).map(x=>`<tr><td><strong>${esc(x.name||'Unknown')}</strong><br><small>${esc(x.type)}${x.email?` · ${esc(x.email)}`:''}</small></td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.code)}</a><br><small>${esc(x.url)}</small></td><td>${esc(x.status)}${x.type==='creator'?`<small class="member-attribution">Discord: ${x.discordConnected?'Connected':'Awaiting connection'}</small><small class="member-attribution">VIP access: ${x.accessMode==='PARTNERSHIP'?(x.accessEndsAt?`partnership ends ${esc(new Date(x.accessEndsAt).toLocaleString())}`:'active partnership'):(x.trialExpiresAt?`temporary until ${esc(new Date(x.trialExpiresAt).toLocaleString())}`:'not started')}</small><small class="member-attribution">Payout: ${esc(x.payoutStatus||'NOT_CONNECTED')}</small>`:''}</td><td>${esc(x.visits)}</td><td>${esc(x.successful)}</td><td>${esc(x.pending)}</td><td>${money(x.paidCents)}</td></tr>`).join('')||'<tr><td colspan="7">No referral links issued yet.</td></tr>';
}
async function load(){
  const sequence=++loadSequence;
  if(!token)return;
  let params=new URLSearchParams({range:currentRange});
  try{if(currentRange==='custom')params=customRangeParams(document.querySelector('[data-start]').value,document.querySelector('[data-end]').value)}catch(error){status.textContent=error.message;dashboard.setAttribute('aria-busy','false');return}
  status.textContent='Refreshing selected dates…';dashboard.setAttribute('aria-busy','true');
  try{
    const response=await fetch(`${config.workerOrigin}/admin/analytics?${params}`,{headers:{Authorization:`Bearer ${token}`}});
    if(sequence!==loadSequence)return;
    if(!response.ok){
      if(response.status===401){localStorage.removeItem('kbh.admin.session');token='';login.hidden=false;dashboard.hidden=true;throw new Error('Your secure 30-day session expired. Sign in again to renew it.')}
      const error=await response.json().catch(()=>({}));throw new Error(error.error||'The dashboard could not refresh. Try the date filter again.');
    }
    const data=await response.json();
    if(sequence!==loadSequence)return;
    render(data);renderExecutive(data);renderTarget(data);renderPaymentAndReferralDetails(data);renderOverview(data);labelMobileTables();
    const notices=[...(data.dataCompletenessWarnings||[])];
    if(data.reportingExclusions?.customers)notices.push(`${data.reportingExclusions.customers} internal test customers excluded from membership and revenue reports.`);
    const notice=document.querySelector('[data-data-notice]'),warning=document.querySelector('[data-data-warning]');
    if(notice&&warning){notice.hidden=!notices.length;warning.textContent=notices.join(' ');const label=document.querySelector('[data-data-notice-label]');if(label)label.textContent=data.dataCompletenessWarnings?.length?'Some history is incomplete':'Reporting notes';}
  }catch(error){if(sequence===loadSequence)status.textContent=`${error.message}${lastData&&token?' Previous results remain displayed for the dates shown below.':''}`}
  finally{if(sequence===loadSequence)dashboard.setAttribute('aria-busy','false')}
}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>selectRange(b.dataset.range));
document.querySelectorAll('[data-start],[data-end]').forEach(x=>x.onchange=()=>selectRange('custom'));
document.querySelector('[data-member-search]').oninput=()=>{renderMembers();labelMobileTables()};
document.querySelector('[data-member-filter]').onchange=()=>{renderMembers();labelMobileTables()};
document.querySelector('[data-member-scope]').onchange=()=>{renderMembers();labelMobileTables()};
setupDashboardNavigation();
setupCampaignLinks();setupCreatorInvite();load();
