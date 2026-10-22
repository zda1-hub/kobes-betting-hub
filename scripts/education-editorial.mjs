/** Offline editorial checks. This tool cannot publish, fetch, email or invoke an AI. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function assessTopics(topics, today) {
  if (!validDate(today)) throw new Error('A real YYYY-MM-DD review date is required');
  const counts = new Map();
  for (const t of topics) counts.set(normalize(t.title), (counts.get(normalize(t.title)) || 0) + 1);
  return topics.map(t => {
    const reasons = [];
    if (!normalize(t.title)) reasons.push('MISSING_TITLE');
    if (counts.get(normalize(t.title)) > 1) reasons.push('DUPLICATE_TITLE');
    if (!t.target) reasons.push('COVERAGE_REVIEW_REQUIRED');
    if (t.target && topics.some(other => other !== t && other.target === t.target)) reasons.push('CONSOLIDATE_SHARED_DESTINATION');
    if (t.demand?.status !== 'verified' || !t.demand?.evidence) reasons.push('DEMAND_NOT_VERIFIED');
    if (!t.verifiedSources?.length) reasons.push('SOURCE_REVIEW_REQUIRED');
    for (const source of t.verifiedSources || []) {
      if (!/^https:\/\//.test(source.url || '') || !source.supports || !validDate(source.checkedOn) || source.checkedOn > today) reasons.push('INVALID_SOURCE_EVIDENCE');
      else if ((Date.parse(today) - Date.parse(source.checkedOn)) / 86400000 > 90) reasons.push('SOURCE_RECHECK_DUE');
    }
    if (!t.humanApproval?.reviewer || !validDate(t.humanApproval?.date) || t.humanApproval.date > today) reasons.push('HUMAN_REVIEW_REQUIRED');
    return {id:t.id,title:t.title,readyForPublicationReview:reasons.length===0,reasons:[...new Set(reasons)]};
  });
}
export function measureSchedule(pages, today) {
  if (!validDate(today)) throw new Error('Invalid review date');
  return pages.map(page => {
    if (!validDate(page.publishedOn) || page.publishedOn > today) throw new Error('Publication date must be real and not future');
    return {url:page.url,checkpoints:page.checkpoints.map(c => {
      if (![7,14,28].includes(c.day)) throw new Error('Invalid checkpoint');
      const dueOn = new Date(Date.parse(page.publishedOn)+c.day*86400000).toISOString().slice(0,10);
      const populated = ['clicks','impressions','averagePosition'].some(k=>c[k]!==null && c[k]!==undefined);
      if (populated && (!validDate(c.observedOn) || c.observedOn>today || !validDate(c.windowStart) || !validDate(c.windowEnd) || c.windowStart>c.windowEnd || c.windowEnd>c.observedOn || c.observedOn<dueOn || !c.evidence)) throw new Error('Metrics need dated window, due checkpoint and evidence');
      if (populated && (!Number.isInteger(c.clicks) || c.clicks<0 || !Number.isInteger(c.impressions) || c.impressions<c.clicks || !(c.averagePosition===null || (Number.isFinite(c.averagePosition)&&c.averagePosition>=1)))) throw new Error('Invalid metrics');
      return {day:c.day,dueOn,status:populated?'recorded':today>=dueOn?'due':'upcoming',metrics:populated?c:null};
    })};
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const today=process.argv[2];
  const queue=JSON.parse(readFileSync(new URL('../docs/seo/editorial-topics.json',import.meta.url)));
  const log=JSON.parse(readFileSync(new URL('../docs/seo/measurement-log.json',import.meta.url)));
  console.log(JSON.stringify({reviewedOn:today,topics:assessTopics(queue.topics,today),measurement:measureSchedule(log.pages,today)},null,2));
}
