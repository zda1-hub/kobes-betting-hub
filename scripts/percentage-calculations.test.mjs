import test from 'node:test';
import assert from 'node:assert/strict';
import {combinePercentages} from '../education/percentage-calculations.mjs';
const a={made:'1',attempted:'2'},b={made:'9',attempted:'10'};
test('unequal denominators distinguish mean from combined rate',()=>{
 const r=combinePercentages([a,b]);assert.equal(r.mean,70);assert.equal(r.made,10);assert.equal(r.attempted,12);assert.ok(Math.abs(r.combined-250/3)<1e-12);
});
test('zero-attempt groups stay undefined; remaining attempts still combine',()=>{
 const zero={made:'0',attempted:'0'},r=combinePercentages([zero,b]);assert.equal(r.groups[0].rate,null);assert.equal(r.mean,null);assert.equal(r.combined,90);
 const empty=combinePercentages([zero,zero]);assert.equal(empty.mean,null);assert.equal(empty.combined,null);
});
test('zero makes with positive attempts and equal denominators',()=>{
 const r=combinePercentages([{made:'0',attempted:'10'},b]);assert.equal(r.mean,45);assert.equal(r.combined,45);
});
test('malformed counts, inconsistent makes and domain overflow reject with field context',()=>{
 for(const field of ['made','attempted'])for(const value of ['', ' ', '-1','1.5','NaN','Infinity','1e3','1,000','50%','1000001','9'.repeat(17)])
 assert.throws(()=>combinePercentages([{...a,[field]:value},b]),e=>e.index===0&&e.field===field);
 assert.throws(()=>combinePercentages([a,{made:'11',attempted:'10'}]),e=>e.index===1&&e.field==='made');
 assert.throws(()=>combinePercentages([a]));
});
test('combined totals at documented bounds remain exact and finite',()=>{
 const r=combinePercentages([{made:'1000000',attempted:'1000000'},{made:'1000000',attempted:'1000000'}]);assert.equal(r.made,2000000);assert.equal(r.attempted,2000000);assert.equal(r.mean,100);assert.equal(r.combined,100);
});
