function normalizeSelection(value) {
  return String(value || '')
    .replace(/:\s*$/, '')
    .replaceAll('−', '-')
    .replace(/\bO(?=\d)/i, 'OVER ')
    .replace(/\bU(?=\d)/i, 'UNDER ')
    .replace(/\s*\(([+-]\d{3,4})\)\s*$/, '')
    .trim();
}

function manualFreePickRecord(message, { operatingDate, guildId, channelId, approverIds }) {
  if (!message?.id || !message?.content || message.author?.bot) return null;
  if (!approverIds?.has(String(message.author?.id || ''))) return null;
  if (String(message.channelId || '') !== String(channelId || '')) return null;

  const rawLines = String(message.content).split(/\r?\n/);
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const header = lines[0];
  const evidence = lines.filter((line) => /^[-•*]\s*\S/.test(line)).map((line) => line.replace(/^[-•*]\s*/, '').trim());
  const marketPattern = /\b(?:over|under|receptions?|receiving\s+yards?|rushing\s+(?:yards?|attempts?)|attempts?|carries|touchdowns?|tds?|completions?|interceptions?|sacks?|targets?|longest\s+(?:reception|rush)|anytime\s+(?:touchdown|td)|to\s+score)\b|\b[ou]\s*\d/i;
  const odds = header.replaceAll('−', '-').match(/\(([+-]\d{3,4})\)\s*:?[\s]*$/)?.[1] || '';
  const selection = normalizeSelection(header);
  const line = selection.match(/\b(?:OVER|UNDER)\s*(\d+(?:\.\d+)?)/i)?.[1] || '';
  if (!marketPattern.test(header) || !odds || evidence.length < 2 || selection.length > 256) return null;

  const event = lines.slice(1).find((line) => !/^[-•*]\s*/.test(line))?.replace(/:\s*$/, '').trim() || '';
  const createdAt = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdTimestamp || Date.now());
  const date = operatingDate(createdAt);
  const pickId = `discord-manual-free-${message.id}`;
  const postReference = `https://discord.com/channels/${guildId}/${channelId}/${message.id}`;
  const publishedAt = createdAt.toISOString();
  const authorId = String(message.author.id);
  return {
    row: {
      pick_id: pickId, operating_date: date, event, sport: 'football', league: 'NFL', market: 'player_prop',
      selection, published_line: line, published_odds_american: odds, units_risked: '', source_name: 'Kobe',
      credit_text: 'Kobe manual Free Pick', approver: authorId, approved_at: publishedAt, published_by: authorId,
      published_at: publishedAt, destination: '#free-picks', post_reference: postReference, status: 'PUBLISHED',
    },
    packet: {
      pick_id: pickId,
      source: { publish_mode: 'independent_writeup', post_url: postReference },
      approval: { exact_evidence: evidence },
      analysis: { extraction: { sport: 'football', league: 'NFL', event, selection, line, odds_american: odds, units: '', source_claims: evidence } },
    },
  };
}

module.exports = { manualFreePickRecord, normalizeSelection };
