const { createHash } = require('node:crypto');
const hash = s => createHash('sha256').update(s).digest('hex');
const SOURCE = 'NickyCashin\n\nNBA \nCavaliers +4.5 (-110) 1.5U\n\nNCAAF\nBall State +1.5 (-110) 2U\n\nCBB\nLoyola -10.5 (-110) 1.5U\nCharleston ML (-125) 1.5U\nSt. Bonaventure -8.5 (-110) 1.5U';
const TERMS = [['Cavaliers +4.5','+4.5','-110','1.5U','NBA'],['Ball State +1.5','+1.5','-110','2U','NCAAF'],['Loyola -10.5','-10.5','-110','1.5U','NCAAB'],['Charleston ML','ML','-125','1.5U','NCAAB'],['St. Bonaventure -8.5','-8.5','-110','1.5U','NCAAB']];
const REFERENCE='https://discord.com/channels/1215407647155683358/1539055850075852911/1570230546687332413';
const DESCRIPTION='NickyCashin\n• Cavaliers +4.5 -110 (1.5U)\n• Ball State +1.5 -110 (2U)\n• Loyola -10.5 -110 (1.5U)\n• Charleston ML -125 (1.5U)\n• St. Bonaventure -8.5 -110 (1.5U)';
// Reviewed against the unchanged published Discord message on November 12.
// Only recover this exact approved publication; never broaden lossless recovery.
function recoverReviewed264(row, packet) {
 const x=packet?.analysis?.extraction, s=packet?.source;
 if(row.pick_id!=='20261111-264-X'||packet?.pick_id!==row.pick_id||row.operating_date!=='2026-11-11'
 ||row.post_reference!==REFERENCE||row.published_by!=='1539103276107046955'||row.approver!=='1209660006383755265'
 ||Date.parse(row.approved_at)!==Date.parse('2026-11-12T00:15:10.729Z')||Date.parse(row.published_at)!==Date.parse('2026-11-12T00:15:11.621Z')
 ||row.selection!=='Cavaliers +4.5'||row.published_line!=='+4.5'||row.published_odds_american!=='-110'||row.units_risked!=='1.5U'||row.market||row.sport||row.league
 ||s?.post_id!=='2120654345016680675'||s.post_url!=='https://x.com/EZMSports/status/2120654345016680675'||Date.parse(s.posted_at)!==Date.parse('2026-11-11T23:06:10Z')
 ||hash(String(s.text||'').replace(/\r\n/g,'\n').trim())!==hash(SOURCE)||!Array.isArray(x?.plays)||x.plays.length!==5||x.league||x.sport) return null;
 const plays=[];
 for(let i=0;i<5;i++) { const p=x.plays[i], [selection,line,odds,units,league]=TERMS[i];
 if(p.selection!==selection||p.line!==line||p.odds_american!==odds||p.units!==units||p.event||p.player_name||p.league||p.sport||p.market)return null;
 plays.push({...p,league,sport:league}); }
 return {...x,lossless_text_terms:true,plays,source_heading_recovery:{source_post_id:s.post_id,source_sha256:hash(SOURCE),reviewed_at:'2026-11-12',publication_reference:REFERENCE,publication_description_sha256:hash(DESCRIPTION),publication_message_timestamp:'2026-11-12T00:15:35.803Z',publication_verified_unedited_on:'2026-11-12'}};
}
module.exports={recoverReviewed264};
