// Conservative, lossless parser for capper-name + wager-line exclusive posts.
// Unknown prose falls back to normal image/model extraction, never guessed terms.
function exclusiveTextExtraction(source, text) {
  if (source?.publish_mode !== 'terms_only') return null;
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const capper = lines.shift();
  if (!capper || !/^[\p{L}\p{N} .’'&_-]{2,60}$/u.test(capper)
    || /\b(?:picks? of|report|recap|results?|package|sale|subscribe|week|tonight|tomorrow|public betting)\b/i.test(capper)
    || [source.handle, source.display_name].some(n => String(n || '').toLowerCase() === capper.toLowerCase())) return null;
  const labels = /^(?:NFL|MLB|NBA|WNBA|NHL|NCAAF|NCAAB|CFB|MLS|NFL Props?|MLB Props?|College Football|Soccer)$/i;
  const league = lines.find(s => labels.test(s)) || '';
  const bets = lines.filter(s => !labels.test(s));
  const namedMarket = /[\p{L}].*?(?:\b(?:ML|moneyline|over|under|BTTS|NRFI|YRFI)\b|\b[ou]\s*\d|[\s(][+-]\s*\d)/iu;
  if (!bets.length || bets.length > 30 || bets.some(s => s.length > 240 || !namedMarket.test(s)
    || /https?:|\b(?:subscribe|sale|package|record|win rate|last week|yesterday|already won|cashed|no play|pass on)\b/i.test(s))) return null;
  const plays = bets.map(selection => ({ selection, player_name: '', line: '', odds_american: '', units: '', event: '', source_claims: [] }));
  return { is_pick_candidate: true, source_capper_name: capper, sport: league, league,
    event: '', market: '', selection: bets[0], player_name: '', line: '', odds_american: '', units: '',
    plays, source_claims: [], image_summary: '', missing_or_ambiguous: [],
    lossless_text_terms: true };
}

function exclusiveSourceIsCurrent(packet, now = new Date()) {
  const posted = new Date(packet.source?.posted_at || '');
  if (!Number.isFinite(posted.getTime()) || posted > now) return false;
  const date = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return date(posted) === date(now);
}

// Aggregators explicitly separate original cappers with horizontal rules.
// Parse blocks independently: an incomplete block must not contaminate another.
function exclusiveTextGroups(source, text) {
  if (!source?.exclusive_text_groups || source.publish_mode !== 'terms_only') return [];
  return String(text || '').split(/\r?\n\s*[─━—_-]{5,}\s*\r?\n/).map((block, index) => {
    const lines = block.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const capper = lines[0] || '';
    const body = lines.slice(1).filter(s => !/^(?:MLB\s+Part\s+\d+\/\d+|Thursday Plays)$/i.test(s));
    const genericHeading = /^(?:exclusive (?:play|pick)s?|free picks?|vip picks?|daily plays?|results?|recap)$/i.test(capper);
    const extraction = genericHeading ? null : exclusiveTextExtraction(source, [capper, ...body].join('\n'));
    return { index, capper, extraction, reason: extraction ? null : 'Original capper or complete market terms are unclear.' };
  });
}

function exclusiveWagerKey(capper, selection) {
  return `${String(capper || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}|${String(selection || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function completeXPost(post) {
  return { ...post, text: post.note_tweet?.text || post.text || '' };
}

module.exports = { exclusiveTextExtraction, exclusiveSourceIsCurrent, exclusiveTextGroups, exclusiveWagerKey, completeXPost };
