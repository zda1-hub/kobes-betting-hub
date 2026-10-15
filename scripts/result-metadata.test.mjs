import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {publicMetadata}=createRequire(import.meta.url)('../result-metadata.js');
test('WNBA matchup names label missing imports without confusing Liberty college picks',()=>{
 for(const selection of ['Liberty/Dream u171.5 -115','Dream vs Liberty under 172.5','ATLANTA DREAM @ NEW YORK LIBERTY Under 172','Wings/Valkyries u158.5']) assert.equal(publicMetadata({selection,sport:''}).sport,'WNBA');
 assert.equal(publicMetadata({selection:'Liberty -7',sport:''}).sport,'');
});
test('recognizable baseball and full hockey team names fill missing sport fields',()=>{
 for(const selection of ['Guardians ML -120','Brewers ML','Astros -1.5','Philadelphia Phillies ML']) assert.equal(publicMetadata({selection,sport:''}).sport,'Baseball');
 for(const selection of ['Anaheim Ducks ML','Seattle Kraken ML','Winnipeg Jets +1.5']) assert.equal(publicMetadata({selection,sport:''}).sport,'Hockey');
 assert.equal(publicMetadata({selection:'Ducks ML',sport:''}).sport,'');
 assert.equal(publicMetadata({selection:'Jets ML',sport:''}).sport,'');
});
test('metadata correction preserves wager, grade, source and verification identity',()=>{
 const item={id:'receipt-1',date:'2026-10-09',selection:'Atlanta Dream/New York Liberty u172 -110 3U',sport:'',result:'W',source:'Original source',line:'172',odds:'-110',verifiedAt:'2026-10-10T01:00:00Z'};
 const corrected=publicMetadata(item);assert.equal(corrected.sport,'WNBA');assert.equal(corrected.sportStatus,'validated');
 const {sport,sportStatus,...rest}=corrected;const {sport:previous,...original}=item;assert.deepEqual(rest,original);assert.equal(item.sport,'');
});

test('conflicting grouped labels are corrected only with unambiguous identity',()=>{
 assert.equal(publicMetadata({selection:'Oilers Moneyline (2 units)',sport:'MLB'}).sport,'Hockey');
 const college=publicMetadata({selection:'FIU +3.5 (2 units)',sport:'MLB'});
 assert.equal(college.sport,'');assert.equal(college.sportStatus,'needs_review');
 assert.equal(publicMetadata({selection:'FIU +3.5',sport:'College Football'}).sport,'College Football');
 assert.equal(publicMetadata({selection:'Blues ML (-115) 1.5u',sport:'College Football'}).sportStatus,'needs_review');
});
