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
module.exports = { recoverReviewedSourceHeadings };
