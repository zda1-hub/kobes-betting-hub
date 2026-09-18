// Parser-only normalization. Stored selections, odds and result fingerprints
// remain the exact original publication; this never substitutes betting lines.
function normalizeSelection(value) {
  return String(value || '').trim()
    .replace(/^(?:\d+(?:\.\d+)?|\.\d+)\s*(?:U\s*-|u\s*-|\*|%|units?\s+(?:NFL|MLB|CFB)\s*:?)\s*/i, '')
    .replace(/^\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+/i, '')
    .replace(/\b([ou])\s*(\d+(?:\.\d+)?)/gi, (_, side, line) => `${side.toLowerCase() === 'o' ? 'Over' : 'Under'} ${line}`)
    .replace(/(\d+)[’'](?=\s|\(|$)/g, '$1.5')
    .replace(/([+-])\s+(\d)/g, '$1$2')
    .replace(/\bTT\b/gi, 'Team Total')
    .replace(/\bNo Run First Inning\b/gi, 'NRFI')
    .replace(/\b(?:Yes Run First Inning|Run First Inning)\b/gi, 'YRFI')
    .replace(/\b(?:ATD|ATTD|Anytime TD)\b/gi, 'Anytime Touchdown')
    .replace(/\((?:[A-Z]{2,3})\)\s*(?=Over|Under|Anytime|\d+\+)/gi, '')
    .replace(/\s+@\s+/g, ' at ')
    .replace(/\s+/g, ' ').trim();
}

function combinationSelections(selection) {
  const slash = selection.indexOf('/');
  // A slash between two team names identifies a matchup, not two wagers.
  const slashCombines = slash >= 0 && /\b(?:ML|moneyline|BTTS|NRFI|YRFI)\b|\b(?:over|under)\s+\d|(?:^|\s)[+-]\d/i.test(selection.slice(0, slash));
  const cleaned = selection.replace(/^Parlay\s*\d*\s*:\s*/i, '')
    .replace(/\s*\([^)]*\bparlay\b[^)]*\)\s*$/i, '')
    .replace(/\bparlay\b/gi, '').trim();
  return cleaned.split(slashCombines ? /\s*\/\s*|\s+\+\s+(?=[A-Za-z])/ : /\s+\+\s+(?=[A-Za-z])/).map(s => s.trim());
}

module.exports = { normalizeSelection, combinationSelections };
