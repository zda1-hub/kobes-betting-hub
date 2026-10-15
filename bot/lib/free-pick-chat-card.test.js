const test=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {chatCardCopy,chatCardSvg,renderFreePickChatCard,dailyOpener,DAILY_OPENERS}=require('./free-pick-chat-card');
const packet={pick_id:'20261015-017-X',analysis:{extraction:{selection:'Over 3.5 receptions',player_name:'DeVaughn Vele',line:'3.5',odds_american:'-125',source_claims:['He has gone over this line in 3/4 games','He has had 6+ targets in all four games']}}};
test('uses approved named terms and complete claims, with the requested shopping opener',()=>{
 const copy=chatCardCopy(packet);assert.match(copy.term,/DeVaughn Vele/);assert.match(copy.term,/-125/);assert.deepEqual(copy.evidence,packet.analysis.extraction.source_claims);
 assert.equal(copy.hook,"Babe, can I get money to go shopping?"); assert.match(chatCardSvg(packet),/Babe, can I get money/);assert.doesNotMatch(chatCardSvg(packet),/Babby|guaranteed|today.s free pick/);
});
test('renders the real 1080 by 1920 Reel JPEG',async()=>{const data=await renderFreePickChatCard(packet);const meta=await sharp(data).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1920);assert.equal(meta.format,'jpeg');});
test('requires a name and a breakdown; never drops additional parlay legs',()=>{
 assert.throws(()=>chatCardCopy({...packet,analysis:{extraction:{...packet.analysis.extraction,player_name:''}}}),/full name/);
 assert.throws(()=>chatCardCopy({...packet,analysis:{extraction:{...packet.analysis.extraction,source_claims:[]}}}),/breakdown/);
 assert.throws(()=>chatCardCopy({...packet,analysis:{extraction:{...packet.analysis.extraction,plays:[{...packet.analysis.extraction},{...packet.analysis.extraction}]}}}),/parlay/);
});

test('daily copy rotates with the original pick date and stays stable on retry',()=>{
 const hooks = Array.from({length:14},(_,i)=>dailyOpener({...packet,publishedDate:`2026-10-${15+i}`}));
 assert.equal(new Set(hooks).size,14);
 assert.equal(dailyOpener(packet),hooks[0]);
 assert.equal(dailyOpener({...packet,pick_id:'20261015-999-X'}),hooks[0]);
 assert.equal(dailyOpener({...packet,publishedDate:'2026-10-29'}),hooks[0]);
 assert.throws(()=>dailyOpener({...packet,pick_id:'undated'}),/original pick date/);
 assert.throws(()=>dailyOpener({...packet,publishedDate:'2026-02-31'}),/original pick date/);
 for(const hook of DAILY_OPENERS) assert.ok(hook.length <= 62);
});
