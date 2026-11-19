import test from 'node:test';
import assert from 'node:assert/strict';
import assets from './road-to-truck-assets.js';

test('daily dated card can be stored and fetched, other paths are rejected',async()=>{
  const objects=new Map();
  const env={TRUCK_ASSET_SECRET:'test',TRUCK_ASSETS:{
    async get(key){return objects.get(key)||null},
    async put(key,body){objects.set(key,{body})},
  }};
  const url='https://assets.example/assets/road_to_truck/daily-2026-11-19.png';
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,...Array(100).fill(0)]);
  const put=await assets.fetch(new Request(url,{method:'PUT',headers:{authorization:'Bearer test','content-type':'image/png'},body:png}),env);
  assert.equal(put.status,200);
  const get=await assets.fetch(new Request(url),env);
  assert.equal(get.status,200);
  assert.equal(get.headers.get('content-type'),'image/png');
  assert.equal((await assets.fetch(new Request('https://assets.example/assets/road_to_truck/foo.png'),env)).status,404);
});
