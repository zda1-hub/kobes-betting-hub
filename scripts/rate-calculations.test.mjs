import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRateRecord} from '../education/rate-calculations.mjs';
const example={total:'48',games:'4',minutes:'48'};
test('original four-appearance records preserve the totals and reverse the rate ordering',()=>{
 const a=calculateRateRecord(example),b=calculateRateRecord({total:'72',games:'4',minutes:'120'});
 assert.deepEqual(a,{total:48,games:4,minutes:48,perGame:12,perMinute:1,per36:36});
 assert.equal(b.perGame,18);assert.equal(b.perMinute,0.6);assert.ok(Math.abs(b.per36-21.6)<1e-12);
 assert.ok(a.perGame<b.perGame&&a.per36>b.per36);
});
test('zero total and decimal minutes are valid; no integer truncation',()=>{
 assert.equal(calculateRateRecord({...example,total:'0'}).per36,0);
 const r=calculateRateRecord({total:'5',games:'2',minutes:'12.5'});
 assert.equal(r.perGame,2.5);assert.equal(r.perMinute,0.4);assert.equal(r.per36,14.4);
});
test('rates use total minutes rather than mean of appearance rates',()=>{
 const r=calculateRateRecord({total:'15',games:'2',minutes:'30'});
 assert.equal(r.perMinute,0.5);assert.notEqual(r.perMinute,(10/10+5/20)/2);
});
test('invalid totals and denominators identify the field',()=>{
 for(const field of ['total','games','minutes'])for(const text of ['', ' ', '-1','NaN','Infinity','1e3','1,000','50%','12:30','<b>1</b>','1000001','1'.repeat(17)]){
  assert.throws(()=>calculateRateRecord({...example,[field]:text}),error=>error.field===field);
 }
 for(const field of ['games','minutes'])assert.throws(()=>calculateRateRecord({...example,[field]:'0'}));
 for(const field of ['games','total'])assert.throws(()=>calculateRateRecord({...example,[field]:'1.5'}));
 assert.throws(()=>calculateRateRecord({...example,minutes:'0.00001'}));
});
test('documented boundaries are finite and remain unrounded internally',()=>{
 const r=calculateRateRecord({total:'1000000',games:'1000000',minutes:'0.0001'});
 assert.equal(r.perGame,1);assert.equal(r.perMinute,10000000000);assert.equal(r.per36,360000000000);
 assert.equal(calculateRateRecord({...example,total:'1',games:'3'}).perGame,1/3);
});
