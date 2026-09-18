// Parser-only normalization. Stored selections, odds and result fingerprints
// remain the exact original publication; this never substitutes betting lines.
function normalizeSelection(value) {
  return String(value || '').trim()
    .replace(/^(?:\d+(?:\.\d+)?|\.\d+)\s*(?:U\s*-|u\s*-|\*|%|units?\s+(?:NFL|MLB|CFB)\s*:?)\s*/i, '')
    .replace(/^\d{1,4}(?::\d{2})?\s*(?:am|pm)\s+/i, '')
    .replace(/\b([ou])\s*(\d+(?:\.\d+)?)/gi, (_, side, line) => `${side.toLowerCase() === 'o' ? 'Over' : 'Under'} ${line}`)
    .replace(/(\d+)[’'](?=\s|\(|$)/g, '$1.5')
    .replace(/([+-])\s+(\d)/g, '$1$2')
    .replace(/\bTT\b/gi, 'Team Total')
    .replace(/\bNo Run First Inning\b/gi, 'NRFI')
    .replace(/\b(?:Yes Run First Inning|Run First Inning)\b/gi, 'YRFI')
    .replace(/\b(?:ATD|ATTD|Anytime TD)\b/gi, 'Anytime Touchdown')
    .replace(/(\b(?:Over|Under)\s+\d+(?:\.\d+)?)\s+pass(?=\s+[+-]\d|\s*\(|$)/gi, '$1 Passing Yards')
    .replace(/^(.+?)\s+\(([+-]\d{1,2}(?:\.\d+)?)\)(?=\s|$)/, '$1 $2')
    .replace(/\((?:[A-Z]{2,3})\)\s*(?=Over|Under|Anytime|\d+\+)/gi, '')
    .replace(/\s+@\s+/g, ' at ')
    .replace(/\s+/g, ' ').trim();
}

function combinationSelections(selection) {
  const cleaned = selection.replace(/^Parlay\s*\d*\s*:\s*/i, '')
    .replace(/\s*\([^)]*\bparlay\b[^)]*\)\s*$/i, '')
    .replace(/\bparlay\b/gi, '').trim();
  const parts = [];
  let start = 0, depth = 0;
  for (let index = 0; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth) continue;
    const prefix = cleaned.slice(start, index);
    const slash = char === '/' && /\b(?:ML|moneyline|BTTS|NRFI|YRFI)\b|\b(?:over|under)\s+\d|(?:^|\s)[+-]\d|\d+\+\s+(?:passing|rushing|receiving|yards)/i.test(prefix);
    const plus = char === '+' && /\s/.test(cleaned[index - 1] || '') && /^\s+[A-Za-z]/.test(cleaned.slice(index + 1));
    if (slash || plus) { parts.push(prefix.trim()); start = index + 1; }
  }
  parts.push(cleaned.slice(start).trim());
  return parts;
}

module.exports = { normalizeSelection, combinationSelections };
function playerNameMatches(published, official) {
  const compact = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const withoutSuffix = value => String(value || '').replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i, '');
  if (compact(published) === compact(official)) return true;
  if (withoutSuffix(published) !== String(published || '')) return false;
  if (compact(published) === compact(withoutSuffix(official))) return true;
  if (/^[A-Z]{3,6}$/.test(String(published || '').trim()) && String(published).trim() === withoutSuffix(official).split(/[\s.-]+/).filter(Boolean).map(word => word[0].toUpperCase()).join('')) return true;
  const initial = String(published || '').trim().match(/^([A-Z])\.\s*(.+)$/i);
  if (!initial) return false;
  const parts = withoutSuffix(official).trim().split(/\s+/);
  return parts.length > 1 && parts[0][0]?.toLowerCase() === initial[1].toLowerCase()
    && compact(parts.slice(1).join(' ')).endsWith(compact(initial[2]));
}
module.exports.playerNameMatches = playerNameMatches;
