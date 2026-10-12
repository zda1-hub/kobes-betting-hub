const { publicationGradeHold } = require('./recap-review');

const text = value => String(value ?? '').trim();

// Repair only the omitted structured name, never reconstruct a wager from
// prose, claims, team rosters or the first leg of a publication group.
function hydrateCanonicalPlayer(row, packet) {
  if (!packet || packet.pick_id !== row.pick_id || publicationGradeHold(row, packet)) return row;
  const extraction = packet.analysis?.extraction;
  if (!extraction) return row;
  const plays = extraction.plays;
  if (plays != null && !Array.isArray(plays)) return row;
  if (plays?.length > 1) return row;
  const play = plays?.[0] || extraction;
  const selection = text(row.selection);
  // Already named selections are immutable, including a name that disagrees
  // with later packet edits. Such discrepancies need human review.
  if (!/^(?:over|under)\b/i.test(selection) || text(play.selection || extraction.selection) !== selection) return row;
  if (text(play.line || extraction.line) !== text(row.published_line)
    || text(play.odds_american || extraction.odds_american) !== text(row.published_odds_american)) return row;
  for (const field of ['event', 'league', 'sport']) {
    const packetValue = text(play[field] || extraction[field]);
    if (packetValue && text(row[field]) && packetValue.toLowerCase() !== text(row[field]).toLowerCase()) return row;
  }
  if (packet.operating_date && packet.operating_date !== row.operating_date) return row;
  const names = [play.player_name, play.playerName, extraction.player_name, extraction.playerName]
    .map(text).filter(Boolean);
  if (!names.length || names.some(name => name.toLowerCase() !== names[0].toLowerCase())) return row;
  const name = names[0];
  if (/[\r\n]/.test(name) || !/^[\p{L}][\p{L}.'’\-]*(?: +[\p{L}][\p{L}.'’\-]*)+$/u.test(name) || /^(?:unknown|player|not confirmed)\b/i.test(name)) return row;
  return { ...row, selection: `${name} ${selection}` };
}

module.exports = { hydrateCanonicalPlayer };
