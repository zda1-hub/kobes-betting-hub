'use strict';
// Explicitly called only after target guild and administrator approval are verified.
const TOOL_NAME='Trends-tool';
const CATEGORY='📊・LINEMATE ANALYTICS';
const CHANNELS=['🏀・nba-high-hit-rates','🏈・nfl-high-hit-rates','⚾・mlb-high-hit-rates','🏒・nhl-high-hit-rates','🔎・prop-search-engine','popular-trends'];
async function provision(guild,{expectedGuildId,apply=false,visibilityConfirmed=false}={}) {
  if(!expectedGuildId || guild.id!==expectedGuildId) throw new Error('Verified target guild required');
  if(apply && !visibilityConfirmed) throw new Error('Confirm visibility of the new category before creating channels');
  const all=await guild.channels.fetch();
  const matches=[...all.values()].filter(c=>c?.name===CATEGORY);
  if(matches.length>1 || matches.some(c=>c.type!==4)) throw new Error('Ambiguous category; no changes made');
  let category=matches[0];const actions=[];
  // Complete ambiguity preflight before any writes.
  if(category) for(const name of CHANNELS){
    const existing=[...all.values()].filter(c=>c?.name===name && c.parentId===category.id);
    if(existing.length>1 || existing.some(c=>c.type!==0)) throw new Error('Ambiguous analytics channel; no changes made');
  }
  if(!category){actions.push({create:'category',name:CATEGORY});if(apply)category=await guild.channels.create({name:CATEGORY,type:4,reason:'User requested isolated Trends-tool analytics category'});}
  for(const name of CHANNELS){
    const matching=[...all.values()].filter(c=>c?.name===name && category && c.parentId===category.id);
    if(matching.length>1 || matching.some(c=>c.type!==0)) throw new Error('Ambiguous analytics channel');
    if(!matching.length){actions.push({create:'channel',name});if(apply)await guild.channels.create({name,type:0,parent:category.id,reason:'User requested Trends-tool channel'});}
  }
  return {applied:apply,actions};
}
module.exports={TOOL_NAME,CATEGORY,CHANNELS,provision};
