const fs = require('node:fs/promises');
const path = require('node:path');

const FREE_BOARD_MARKER = 'KBH free-writeups-v1';

function isWriteup(row) {
  return row.status === 'PUBLISHED' && /writeups?/i.test(row.destination || '');
}

function sportLabel(row) {
  const value = `${row.sport || ''} ${row.league || ''}`.toLowerCase();
  if (/football|nfl|ncaaf/.test(value)) return ['🏈', 'football'];
  if (/baseball|mlb/.test(value)) return ['⚾', 'baseball'];
  if (/basketball|nba|wnba|ncaab/.test(value)) return ['🏀', 'basketball'];
  if (/hockey|nhl/.test(value)) return ['🏒', 'hockey'];
  if (/soccer|mls/.test(value)) return ['⚽', 'soccer'];
  return ['🎯', 'sports'];
}

function privateWagerKey(row) {
  return [row.selection, row.published_line, row.published_odds_american]
    .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9.+-]+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

function safeEvidenceTopics(row) {
  // Never copy writeup sentences into a public preview. Even sentences without
  // the wager can identify a player, team, or target line indirectly.
  const source = String(row.teaser_source || '').toLowerCase();
  return [
    [/\b(?:targets?|carries|snaps?|attempts?|usage|workload|opportunities|pitches|pit\/g)\b/, 'Usage and opportunity'],
    [/\b(?:last|recent|season|games?|weeks?|averag\w*|form|l\d{1,2})\b/, 'Recent production'],
    [/\b(?:defense|opponent|matchup|coverage|rank\w*|allowed|vs\.?|home|away|oba|ops|whiff)\b/, 'Matchup context'],
    [/\b(?:injur\w*|questionable|availability|absence|inactive)\b/, 'Availability context']
  ].filter(([pattern]) => pattern.test(source)).slice(0, 3).map(([, label]) => label);
}

function safeEvidenceStats(row) {
  // Only publish normalized hit-rate facts. We deliberately rebuild the text
  // instead of copying source sentences so names, teams, averages, rankings,
  // odds, and other clues from the paid writeup cannot leak into the preview.
  const source = String(row.teaser_source || '');
  const stats = [];
  const seen = new Set();
  const ratio = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/g;
  for (const match of source.matchAll(ratio)) {
    const hits = Number(match[1]);
    const sample = Number(match[2]);
    if (!sample || hits > sample || sample > 25) continue;
    const priorBoundary = Math.max(source.lastIndexOf('.', match.index), source.lastIndexOf('\n', match.index), source.lastIndexOf(';', match.index));
    const following = source.slice(match.index + match[0].length).search(/[.\n;]/);
    const end = following < 0 ? source.length : match.index + match[0].length + following;
    const context = source.slice(priorBoundary + 1, end).toLowerCase();
    let label = 'recent games';
    if (/\b(?:against|versus|vs\.?)\b/.test(context)) label = 'the stated matchup sample';
    else if (/\b(?:when|without|inactive|doesn['’]?t play|lineup)\b/.test(context)) label = 'the stated lineup condition';
    else if (/\b(?:at home|home games?)\b/.test(context)) label = 'recent home games';
    else if (/\b(?:on the road|away games?)\b/.test(context)) label = 'recent away games';
    const fact = `Hit in ${hits}/${sample} ${label}`;
    if (!seen.has(fact)) {
      seen.add(fact);
      stats.push(fact);
    }
    if (stats.length === 2) break;
  }
  return stats;
}

function publicPropLine(row) {
  const published = String(row.published_line || '').trim();
  const selection = String(row.selection || '').trim();
  // A canonical writeup can split the direction across `selection` (for
  // example, "Payton Tolle over") and the threshold across `published_line`
  // ("14.5 outs"). Read them together so the public preview does not collapse
  // to a generic placeholder while the paid post still has the full wager.
  const comparable = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9.+-]+/g, ' ').trim();
  const source = published && comparable(selection).includes(comparable(published))
    ? selection
    : [selection, published].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!source) return '||VIP PICK|| · Market available in VIP';

  // Show the market and threshold Kobe requested, but never the player/team or
  // price. Prefer the separately stored published line; for manual Discord
  // writeups, start at the first recognisable market word in the selection.
  const match = source.match(/\b(over|under|moneyline|draw no bet|to score|anytime touchdown|first touchdown|spread)\b[\s\S]*/i);
  if (!match) return '||VIP PICK|| · Market available in VIP';
  const market = match[0]
    .replace(/(?:\s+|\s+at\s+)[+-]\d{3,4}\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  // Discord spoiler styling gives this a native blurred/frosted appearance.
  // The concealed text is only the harmless label "VIP PICK"—never the
  // actual player or team—so tapping the blur cannot reveal paid information.
  return market ? `||VIP PICK|| · ${market}` : '||VIP PICK|| · Market available in VIP';
}

function shortBreakdown(stats) {
  // Kobe wants the free board to be a true teaser: one or two normalized
  // hit-rate facts and nothing from the paid analysis. If a safe hit rate
  // cannot be extracted, omit the teaser field instead of filling it with
  // generic context or a sentence that hints at the writeup.
  return stats.length ? `${stats.join(' · ')}.` : '';
}

function publicPreviews(rows, date) {
  const eligible = [];
  const seen = new Set();
  for (const row of rows.filter((item) => item.operating_date === date && isWriteup(item))) {
    const key = privateWagerKey(row) || row.pick_id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    eligible.push(row);
  }
  return eligible.map((row, index) => {
    const [emoji, sport] = sportLabel(row);
    const topics = safeEvidenceTopics(row);
    const stats = safeEvidenceStats(row);
    return { number: index + 1, emoji, sport, topics, prop: publicPropLine(row), breakdown: shortBreakdown(stats) };
  });
}

function freeWriteupBoardPayload(rows, date) {
  const previews = publicPreviews(rows, date);
  if (!previews.length) return null;
  return previews.map(({ emoji, sport, prop, breakdown }, index) => ({
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: `${emoji} ${sport[0].toUpperCase()}${sport.slice(1)} VIP writeup · ${index + 1}`,
      description: [prop, breakdown ? `**Relevant stat:** ${breakdown}` : '', 'Full pick and analysis are in VIP.'].filter(Boolean).join('\n\n'),
      footer: { text: `${FREE_BOARD_MARKER} · ${date} · ${index + 1}` }
    }]
  }));
}

async function readState(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function writeState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

function createFreeWriteupBoard({ channelFor, rowsFor, stateFile, operatingDate, syncSite = async () => {} }) {
  async function refresh() {
    const channel = await channelFor();
    const date = operatingDate();
    const rows = await rowsFor();
    const payload = freeWriteupBoardPayload(rows, date);
    const previews = publicPreviews(rows, date);
    const state = await readState(stateFile);
    const recent = await channel.messages.fetch({ limit: 100 });
    const existing = [...recent.values()].filter(message => message.author?.id === channel.client?.user?.id &&
      message.embeds?.some(embed => String(embed.footer?.text || '').includes(FREE_BOARD_MARKER)));
    const desired = new Map((payload || []).map((item, index) => [item.embeds[0].footer.text, { item, index }]));
    const retained = new Map();
    for (const message of existing) {
      const marker = String(message.embeds?.[0]?.footer?.text || '');
      if (!desired.has(marker) || retained.has(marker)) await message.delete();
      else retained.set(marker, message);
    }
    if (!payload) {
      await syncSite({ date, previews: [] });
      await writeState(stateFile, { date, message_ids: [], signatures: [] });
      return { status: 'EMPTY', date, previews: 0 };
    }
    const messageIds = [], signatures = [];
    let changed = false;
    for (const item of payload) {
      const marker = item.embeds[0].footer.text;
      const signature = JSON.stringify(item.embeds);
      const current = retained.get(marker);
      const index = desired.get(marker).index;
      const needsEdit = Boolean(current) && state.signatures?.[index] !== signature;
      const message = current
        ? needsEdit ? await current.edit(item) : current
        : await channel.send(item);
      if (!current || needsEdit) changed = true;
      messageIds.push(message.id);
      signatures.push(signature);
    }
    await writeState(stateFile, { date, message_ids: messageIds, signatures, updated_at: new Date().toISOString() });
    await syncSite({ date, previews });
    return { status: changed ? 'UPDATED' : 'UNCHANGED', date, messageIds, previews: previews.length };
  }
  return { refresh };
}

module.exports = { FREE_BOARD_MARKER, createFreeWriteupBoard, freeWriteupBoardPayload, publicPreviews };
