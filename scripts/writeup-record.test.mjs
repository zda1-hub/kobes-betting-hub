import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { presentation } = require('../writeup-record.js');
const now = Date.parse('2026-10-25T18:00:00Z');
const snapshot = {generatedAt:new Date(now).toISOString(),overall:{wins:999,losses:0},writeupRecord:{scope:'writeup_channels',wins:2,losses:3,pushes:5,voids:7,pending:9,trackingSince:'2026-10-01',through:'2026-10-25'}};
test('percentage uses only writeup wins divided by wins plus losses',()=>{
 const view=presentation(snapshot,now);assert.equal(view.rate,'40.0%');assert.match(view.detail,/5 decided writeups/);assert.match(view.detail,/9 pending/);assert.match(view.period,/Oct 1, 2026/);
});
test('missing, stale, invalid and zero-denominator data never fall back to 65 or overall',()=>{
 for(const value of [{...snapshot,writeupRecord:null},{...snapshot,generatedAt:'invalid'},{...snapshot,generatedAt:new Date(now-49*3600000).toISOString()},{...snapshot,writeupRecord:{...snapshot.writeupRecord,wins:-1}}])assert.equal(presentation(value,now).rate,'—');
 assert.equal(presentation({...snapshot,writeupRecord:{...snapshot.writeupRecord,wins:0,losses:0}},now).rate,'—');
 assert.equal(presentation({...snapshot,writeupRecord:{...snapshot.writeupRecord,wins:0,losses:5}},now).rate,'0.0%');
});
