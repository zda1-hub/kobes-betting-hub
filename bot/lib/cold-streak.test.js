const test = require('node:test');
const assert = require('node:assert/strict');
const {payloadFor}=require('./expert-pulse');
test('cold streak includes below 30%, excludes exact 30%, pushes, voids and outside window',()=>{
 const end=Date.parse('2026-10-15T07:00:00Z'), day=86400000;
 const expert=(name,w,l)=>({name,wins:w,losses:l,references:[],results:[...Array(w).fill('W'),...Array(l).fill('L')].map(grade=>({grade,at:end-day,sport:'nfl'}))});
 const records=[expert('Cold',2,8),expert('Boundary',3,7),expert('Small',0,1),{...expert('Old',0,1),results:[{grade:'L',at:end-6*day}]},{...expert('Push',0,0),results:[{grade:'P',at:end-day},{grade:'V',at:end-day}]}];
 const p=payloadFor({date:'2026-10-15'},records); const text=p.embeds.map(x=>x.description).join('\n');
 const section=text.split('**Cold streak')[1].split('**Best football')[0];
 assert.match(section,/Cold \(2-8, 20%\)/);assert.match(section,/Small.*small sample/); for(const n of ['Boundary','Old','Push'])assert.ok(!section.includes(n));assert.ok(p.expertNames.includes('Cold'));
});
