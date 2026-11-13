const { recoverReviewed267 } = require('./reviewed-source-267');
const { recoverReviewed264 } = require('./reviewed-source-264');
const { createHash } = require('node:crypto');
const PICK_ID = '20261110-216-X';
const SOURCE_ID = '2120282932401332518';
const PUBLICATION_REFERENCE = 'https://discord.com/channels/1215407647155683358/1539055850075852911/1569845447844036690';
const PUBLICATION_SHA256 = '8d6796c066d9890f519e5c7d4b046df0761b73c3ba682cc08f68fe97bf7dd9dd';
const SOURCE_SHA256 = '4b9655066f38ebf3bffd0d52657644d5b945d2745271530729bd615e4528db12';
// Reviewed November 11: this exact approved source contains three independent
// moneylines with explicit per-pick sport headings. Recover only metadata the
// original extractor omitted; never change stored packets or approved terms.
function recoverReviewedSourceHeadings(row, packet) {
  const reviewed = recoverReviewed267(row, packet) || recoverReviewed264(row, packet) || recoverNov11PeriodHeading(row, packet) || recoverNov11SourceHeadings(row, packet);
  if (reviewed) return reviewed;
  const extraction = packet?.analysis?.extraction;
  if (row.pick_id !== PICK_ID || packet?.pick_id !== PICK_ID || row.operating_date !== '2026-11-10'
    || packet.source?.post_id !== SOURCE_ID || packet.source?.post_url !== `https://x.com/EZMSports/status/${SOURCE_ID}`
    || Date.parse(packet.source?.posted_at || '') !== Date.parse('2026-11-10T22:30:18Z')
    || row.post_reference !== PUBLICATION_REFERENCE || row.published_by !== '1539103276107046955'
    || Date.parse(row.published_at || '') !== Date.parse('2026-11-10T22:45:16.079Z')
    || row.approver !== '1209660006383755265' || Date.parse(row.approved_at || '') !== Date.parse('2026-11-10T22:45:14.575Z')
    || row.selection !== 'Ohio ML' || row.market !== 'Moneyline' || row.units_risked !== '2U'
    || row.published_line || row.published_odds_american || !Array.isArray(extraction?.plays)
    || extraction.plays.length !== 3) return null;
  const source = String(packet.source.text || '').replace(/\r\n/g, '\n').trim();
  if (createHash('sha256').update(source).digest('hex') !== SOURCE_SHA256) return null;
  const headings = [...source.matchAll(/^(NCAAF|NBA|CBB)\n([^\n]+) \(2U\)$/gm)];
  if (headings.length !== 3) return null;
  const expected = ['Ohio ML', 'Thunder ML', 'Illinois ML'];
  const leagues = { NCAAF: 'NCAAF', NBA: 'NBA', CBB: 'NCAAB' };
  const plays = [];
  for (let index = 0; index < 3; index++) {
    const play = extraction.plays[index];
    if (play.selection !== expected[index] || headings[index][2] !== play.selection || play.units !== '2U'
      || play.line || play.odds_american || play.event || play.player_name || play.league || play.sport
      || play.market && play.market !== 'Moneyline') return null;
    plays.push({ ...play, league: leagues[headings[index][1]], sport: leagues[headings[index][1]], market: 'Moneyline' });
  }
  return { ...extraction, lossless_text_terms: true, plays,
    source_heading_recovery: { source_post_id: SOURCE_ID, source_sha256: SOURCE_SHA256, reviewed_at: '2026-11-11',
      publication_reference: PUBLICATION_REFERENCE, publication_description_sha256: PUBLICATION_SHA256,
      publication_message_timestamp: '2026-11-10T22:45:21.084Z', publication_verified_unedited_on: '2026-11-11' } };
}
// Only these two original sources and unchanged published receipts were reviewed.
// Never inherit an extraction's first league across a mixed-source publication.
const NOV11 = {
  '20261111-107-X': {
    sourceId: '2120576001105375342', sourceAt: '2026-11-11T17:54:51Z',
    sourceHash: 'cf55203bac4861e1cf8c5e246b917518b4d94e64fb9b6a199d0d7047de04e42b',
    messageId: '1570230300519436372', approvedAt: '2026-11-12T00:14:36.117Z',
    publishedAt: '2026-11-12T00:14:36.333Z', messageAt: '2026-11-12T00:14:37.112Z',
    description: 'Naz Easter\n• Knicks -180\n• Pelicans -180\n• Rockets -235',
    terms: ['Knicks -180', 'Pelicans -180', 'Rockets -235'], leagues: ['NBA', 'NBA', 'NBA']
  },
  '20261111-251-X': {
    sourceId: '2120654484988887173', sourceAt: '2026-11-11T23:06:43Z',
    sourceHash: 'd20728c7be0ac6144c44b25bdc878c16a680e094ffb3cfd9a1d4d48e2e4b2ac6',
    messageId: '1570230481658716173', approvedAt: '2026-11-12T00:15:00.123Z',
    publishedAt: '2026-11-12T00:15:01.132Z', messageAt: '2026-11-12T00:15:20.299Z',
    description: 'Vinny\n• Grizzlies +3.5 (2u)\n• Jazz +4.5 (2u)\n• Michigan ML (2u)\n• Ducks Predators Over 6.5 (2u)',
    terms: ['Grizzlies +3.5 (2u)', 'Jazz +4.5 (2u)', 'Michigan ML (2u)', 'Ducks Predators Over 6.5 (2u)'],
    leagues: ['NBA', 'NBA', 'NCAAB', 'NHL']
  }
};
function recoverNov11SourceHeadings(row, packet) {
  const proof = NOV11[row?.pick_id];
  const extraction = packet?.analysis?.extraction;
  if (!proof || packet.pick_id !== row.pick_id || row.operating_date !== '2026-11-11'
    || row.post_reference !== `https://discord.com/channels/1215407647155683358/1539055850075852911/${proof.messageId}`
    || row.published_by !== '1539103276107046955' || row.approver !== '1209660006383755265'
    || Date.parse(row.published_at || '') !== Date.parse(proof.publishedAt)
    || Date.parse(row.approved_at || '') !== Date.parse(proof.approvedAt)
    || row.selection !== proof.terms[0] || row.market || row.units_risked || row.published_line || row.published_odds_american
    || packet.source?.post_id !== proof.sourceId || packet.source?.post_url !== `https://x.com/EZMSports/status/${proof.sourceId}`
    || Date.parse(packet.source?.posted_at || '') !== Date.parse(proof.sourceAt)
    || extraction?.lossless_text_terms !== true || extraction.league !== 'NBA' || extraction.sport !== 'NBA'
    || !Array.isArray(extraction.plays) || extraction.plays.length !== proof.terms.length) return null;
  const text = String(packet.source.text || '').replace(/\r\n/g, '\n').trim();
  if (createHash('sha256').update(text).digest('hex') !== proof.sourceHash) return null;
  let league = ''; const sourcePlays = [];
  for (const line of text.split('\n').slice(1).map(x => x.trim()).filter(Boolean)) {
    if (/^(?:NBA|NCAAB|NHL)$/.test(line)) league = line;
    else if (league) sourcePlays.push({ selection: line, league });
    else return null;
  }
  if (sourcePlays.length !== proof.terms.length) return null;
  const plays = [];
  for (let i = 0; i < proof.terms.length; i++) {
    const play = extraction.plays[i], source = sourcePlays[i];
    if (play.selection !== proof.terms[i] || source.selection !== play.selection || source.league !== proof.leagues[i]
      || play.units || play.line || play.odds_american || play.event || play.player_name || play.league || play.sport || play.market) return null;
    // Michigan was already uniquely graded before this metadata recovery. Keep
    // its original group-scoped identity so its verified ledger fingerprint is
    // unchanged; league_from_group prevents that inherited NBA label being used.
    plays.push(row.pick_id === '20261111-251-X' && i === 2
      ? { ...play } : { ...play, league: source.league, sport: source.league });
  }
  return { ...extraction, plays, source_heading_recovery: {
    source_post_id: proof.sourceId, source_sha256: proof.sourceHash, reviewed_at: '2026-11-12',
    publication_reference: row.post_reference,
    publication_description_sha256: createHash('sha256').update(proof.description).digest('hex'),
    publication_message_timestamp: proof.messageAt, publication_verified_unedited_on: '2026-11-12'
  } };
}
module.exports = { recoverReviewedSourceHeadings };

// Only the unresolved first-half UMass child receives the omitted source
// heading. Settled sibling fingerprints and ambiguous Nuggets -11H stay intact.
function recoverNov11PeriodHeading(row, packet) {
  const extraction=packet?.analysis?.extraction, source=packet?.source;
  const terms=['Central Michigan -4 1st qtr -110 1.5u','Umass TT over 9.5 1H 1.5U -110','West Georgia ML 2u -125','Indiana state ML/ VMI ML 1.5U -106','Santa Clara ML 1.5U -120','Ducks vs predators over 1.5 1p -145 1.5U','Nuggets -11H 1.5U -115'];
  if(row.pick_id!=='20261111-277-X'||packet?.pick_id!==row.pick_id||row.operating_date!=='2026-11-11'
    ||row.post_reference!=='https://discord.com/channels/1215407647155683358/1539055850075852911/1570230562252394609'
    ||row.published_by!=='1539103276107046955'||row.approver!=='1209660006383755265'
    ||Date.parse(row.approved_at)!==Date.parse('2026-11-12T00:15:12.319Z')||Date.parse(row.published_at)!==Date.parse('2026-11-12T00:15:14.413Z')
    ||row.selection!==terms[0]||row.market||row.published_line||row.published_odds_american||row.units_risked
    ||source?.post_id!=='2120669913547227589'||source.post_url!=='https://x.com/BettingBuddyy/status/2120669913547227589'
    ||source.exclusive_group_key!=='2120669913547227589:1'||Date.parse(source.posted_at)!==Date.parse('2026-11-12T00:08:02Z')
    ||extraction?.lossless_text_terms!==true||extraction.league!=='NCAAF'||extraction.sport!=='NCAAF'
    ||extraction.plays?.length!==7)return null;
  const sourceHash=createHash('sha256').update(String(source.text||'').replace(/\r\n/g,'\n').trim()).digest('hex');
  if(sourceHash!=='845a1bc6fa555176e4e45a59e243b8f0c57a2dd626a244d1a2ff3306cfab32b0')return null;
  const scope=String(source.text).split('───────────────').map(part=>part.trim()).filter(part=>part.startsWith('LEAR LOCKS\n'));
  if(scope.length!==1||!scope[0].includes('NCAAF\n'+terms[0]+'\n'+terms[1]+'\n'))return null;
  if(extraction.plays.some((p,i)=>p.selection!==terms[i]||p.league||p.sport||p.event||p.player_name||p.line||p.odds_american||p.units||p.market))return null;
  return {...extraction,plays:extraction.plays.map((p,i)=>i===1?{...p,league:'NCAAF',sport:'NCAAF'}:p),source_heading_recovery:{
    source_post_id:source.post_id,source_sha256:sourceHash,reviewed_at:'2026-11-12',publication_reference:row.post_reference,
    publication_description_sha256:createHash('sha256').update('LEAR LOCKS\n'+terms.map(t=>'• '+t).join('\n')).digest('hex'),
    publication_message_timestamp:'2026-11-12T00:15:39.514Z',publication_verified_unedited_on:'2026-11-12',recovered_play_numbers:[2]
  }};
}
