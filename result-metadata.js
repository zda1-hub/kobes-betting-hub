/* Public metadata only: never alter wager identity, terms, or verification receipts. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBHResultMetadata = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function publicMetadata(item) {
    const text = `${item.selection || ''} ${item.line || ''}`;
    const declared = String(item.sport || '').trim();
    // Unambiguous market vocabulary and team names only. Ambiguous school/team
    // names are held without a sport instead of inheriting a grouped post label.
    let sport = declared, sportStatus = item.sportStatus === 'needs_review' ? 'needs_review' : 'source';
    if (/\b(?:rushing|receiving|passing)\s+(?:yards|attempts|touchdowns)|\b(?:Buccaneers|49ers|Steelers|Packers|Seahawks|Ravens|Bengals|Chiefs)\b/i.test(text)) { sport = 'Football'; sportStatus = 'validated'; }
    else if (/\b(?:Dodgers|Padres|Yankees|Mets|Orioles|Blue Jays|Red Sox|White Sox)\b/i.test(text)) { sport = 'Baseball'; sportStatus = 'validated'; }
    else if (/\b(?:Blue Jackets|Penguins|Bruins|Canadiens|Maple Leafs)\b/i.test(text)) { sport = 'Hockey'; sportStatus = 'validated'; }
    else if (/\b(?:NHL|hockey)\b/i.test(declared) && /\b(?:Utah State|Iowa State|Washington State|Louisville|Iowa|Kansas)\b/i.test(text)) { sport = ''; sportStatus = 'needs_review'; }
    if (/^nfl$/i.test(sport)) sport='NFL';
    else if (/^(ncaaf|cfb)$/i.test(sport)) sport='College Football';
    else if (/^mlb$/i.test(sport)) sport='MLB';
    else if (/^nhl$/i.test(sport)) sport='NHL';
    else if (/^(football|baseball|hockey|basketball|soccer)$/i.test(sport)) sport=sport[0].toUpperCase()+sport.slice(1).toLowerCase();
    return {...item,sport,sportStatus};
  }
  return {publicMetadata};
});
