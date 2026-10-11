const test=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {chatCardCopy,chatCardSvg,renderFreePickChatCard}=require('./free-pick-chat-card');
const packet={pick_id:'20261011-101-X',analysis:{extraction:{selection:'Over 3.5 receptions',player_name:'DeVaughn Vele',line:'3.5',odds_american:'-125',source_claims:['He has gone over this line in 3/4 games','He has had 6+ targets in all four games']}}};
test('uses approved named terms and complete claims, with correctly spelled Baby',()=>{
 const copy=chatCardCopy(packet);assert.match(copy.term,/DeVaughn Vele/);assert.match(copy.term,/-125/);assert.deepEqual(copy.evidence,packet.analysis.extraction.source_claims);
 assert.match(chatCardSvg(packet),/Baby, what/);assert.doesNotMatch(chatCardSvg(packet),/Babby|guaranteed|shopping/);
});
test('renders the real 1080 by 1350 JPEG',async()=>{const data=await renderFreePickChatCard(packet);const meta=await sharp(data).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);assert.equal(meta.format,'jpeg');});
test('requires a name and a breakdown; never drops additional parlay legs',()=>{
 assert.throws(()=>chatCardCopy({...packet,analysis:{extraction:{...packet.analysis.extraction,player_name:''}}}),/full name/);
 assert.throws(()=>chatCardCopy({...packet,analysis:{extraction:{...packet.analysis.extraction,source_claims:[]}}}),/breakdown/);
 assert.throws(()=>chatCardCopy({...packet,analysis:{extraction:{...packet.analysis.extraction,plays:[{...packet.analysis.extraction},{...packet.analysis.extraction}]}}}),/parlay/);
});
