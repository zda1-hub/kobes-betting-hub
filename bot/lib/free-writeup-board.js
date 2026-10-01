const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createHash } = require('node:crypto');

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
  // Rebuild numeric evidence from sentences about the selected subject.
  // Never copy a source sentence, name, team, line, odds, or bet direction.
  const source = String(row.teaser_source || '').replace(/\*\*|__/g, '');
  const subject = String(row.selection || '').trim().split(/\s+/).slice(0, 2);
  const surname = subject.length === 2 && !/^(over|under|vs\.?|at)$/i.test(subject[1])
    ? subject[1].replace(/[^a-z]/gi, '') : '';
  const stats = [];
  const seen = new Set();
  if (/\bstarting (?:a )?back ?up (?:qb|quarterback)\b/i.test(source)) stats.push('Backup quarterback noted in the matchup');
  if (/\b(?:might|may|could) go run[ -]heavy\b/i.test(source)) stats.push('Writeup considers a run-heavy game plan');
  if (!surname) return stats;
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const subjectMention = new RegExp(`^(?:${escape(subject.join(' '))}|${escape(surname)})\\s+`, 'i');
  const add = (fact) => { if (!seen.has(fact)) { seen.add(fact); stats.push(fact); } };
  // Preserve decimal points. Only accept a fact whose grammatical subject is
  // the selected player; merely mentioning that player in a comparison is unsafe.
  for (const sentence of source.split(/(?<!\d)\.|\.(?!\d)|[\n;!?]+/).map((item) => item.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)) {
    // A self-contained usage bullet has no competing named subject or wager.
    const usageBullet = sentence.match(/^(\d{1,2}) (targets|carries|receptions|attempts) in Weeks? \d{1,2}\s*[-–&]\s*\d{1,2}$/i);
    if (usageBullet && Number(usageBullet[1]) <= 60) add(usageBullet[1] + ' ' + usageBullet[2].toLowerCase() + ' across the cited weeks');
    const mention = sentence.match(subjectMention);
    if (!mention) continue;
    const context = sentence.slice(mention[0].length).toLowerCase();
    // Forecasts and negated statements are not historical results.
    if (/\b(?:not|never|projected|expected|could|would|should|will|might|may)\b/.test(context)) continue;
    const ratio = context.match(/^(?:has\s+)?(?:went over|went under|hit|cleared|covered)(?:\s+in)?\s+(\d{1,2})\s*(?:\/|of)\s*(\d{1,2})(?![\d./])\b/);
    if (ratio) {
      const hits = Number(ratio[1]);
      const sample = Number(ratio[2]);
      if (sample && hits <= sample && sample <= 25) {
        let label = 'the cited sample';
        if (/\b(?:against|versus|vs\.?)\b/.test(context)) label = 'the stated matchup sample';
        else if (/\b(?:when|without|inactive|doesn['’]?t play|lineup)\b/.test(context)) label = 'the stated lineup condition';
        else if (/\b(?:at home|home games?)\b/.test(context)) label = 'recent home games';
        else if (/\b(?:on the road|away games?)\b/.test(context)) label = 'recent away games';
        else if (/\b(?:recent games?|last \d+ games?)\b/.test(context)) label = 'recent games';
        add(hits + '/' + sample + ' in ' + label);
      }
    }
    const catches = context.match(/^coming off? (?:a )?(?:solid |strong )?week \d{1,2} where he hauled in (\d{1,2}) (?:grabs|catches|receptions) on (\d{1,2}) targets\b/);
    if (catches && Number(catches[1]) <= Number(catches[2]) && Number(catches[2]) <= 30)
      add(catches[2] + ' targets in the cited game');
    const outputs = context.match(/^(?:recorded|posted|finished with)\s+(\d{1,3})\s*(?:&|and|,)\s*(\d{1,3})\s+(?:receiving\s+|rushing\s+|passing\s+)?yards\b/);
    if (outputs && /\b(?:weeks?|games?|recent|first two)\b/.test(context))
      add('Recent yardage outputs: ' + outputs[1] + ' and ' + outputs[2]);
    const usage = context.match(/^(?:has|had|saw|received|recorded|logged)\s+(\d{1,2})\s+(targets|carries|receptions|attempts)\b/);
    if (usage && Number(usage[1]) <= 60)
      add(usage[1] + ' ' + usage[2] + ' in the cited sample');
    const average = context.match(/^(?:is\s+)?averag(?:ing|ed)\s+(\d{1,3}(?:\.\d+)?)\s+(receiving|rushing|passing)\s+yards\s+(?:per game|a game)\b/);
    if (average) add(average[1] + ' ' + average[2] + ' yards per game in the cited sample');
    if (stats.length >= 3) break;
  }
  return stats.slice(0, 3);
}

function publicPropLine(row) {
  // The owner requested visible direction, line and market, with identities hidden.
  // Only reconstruct whitelisted terms; never copy trailing names, teams or odds.
  const terms = `${row.selection || ''} ${row.published_line || ''}`;
  const match = terms.match(/\b(over|under|o|u)\s*(\d{1,3}(?:\.\d+)?)\b/i);
  if (!match) return /\b(?:moneyline|ml)\b/i.test(terms) ? 'Moneyline' : 'Prop details in VIP';
  const after = terms.slice(match.index + match[0].length).trim();
  const market = after.match(/^(?:(?:rushing|rush|receiving|rec|passing|pass|total|rush(?:ing)?[ +&]+rec(?:eiving)?)\s+)?(?:yards?|yds?|receptions?|catches|completions?|attempts?|touchdowns?|tds?|strikeouts?|outs?(?:\s+recorded)?|hits?|runs?|points?|rebounds?|assists?|threes?|saves?|goals?|bases?|games?)\b/i);
  return `${/^o/i.test(match[1]) ? 'Over' : 'Under'} ${match[2]}${market ? ` ${market[0].toLowerCase()}` : ''}`;
}

function shortBreakdown(stats, topics) {
  if (stats.length) return `${stats.join('; ')}.`;
  if (topics.length) return `${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(topics.map((topic) => topic.toLowerCase()))}. Full writeup in VIP.`;
  return 'Full writeup in VIP; source preview unavailable.';
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
    return { number: index + 1, emoji, sport, topics, stats, prop: publicPropLine(row), breakdown: shortBreakdown(stats, topics) };
  });
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}
function wrap(value, width) {
  const lines = []; let line = '';
  for (const word of String(value).split(/\s+/)) {
    if (line && `${line} ${word}`.length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
function freeWriteupTableSvg(previews) {
  const width = 2000, split = 710, header = 76;
  const rows = previews.map((item) => {
    const prop = wrap(item.prop, 28), breakdown = wrap(item.breakdown, 70);
    return { prop, breakdown, height: Math.max(80, Math.max(prop.length, breakdown.length) * 43 + 30) };
  });
  const height = header + rows.reduce((sum, row) => sum + row.height, 0);
  let y = header;
  const content = rows.map((row) => {
    const top = y; y += row.height;
    return `<rect x="24" y="${top + 24}" width="135" height="32" rx="12" fill="#d1d1d1"/>
      ${row.prop.map((line, i) => `<text x="180" y="${top + 49 + i * 43}">${escapeXml(line)}</text>`).join('')}
      ${row.breakdown.map((line, i) => `<text x="734" y="${top + 49 + i * 43}">${escapeXml(line)}</text>`).join('')}
      <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#cecece" stroke-width="2"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>text{font-family:Arial,Helvetica,sans-serif;font-size:32px;fill:#151515}</style>
    <rect width="100%" height="100%" fill="white"/>
    <text x="355" y="49" text-anchor="middle">Player or Game prop</text>
    <text x="1355" y="49" text-anchor="middle">Short breakdown, full breakdown in channel</text>
    <line x1="0" y1="1" x2="${width}" y2="1" stroke="#aaa" stroke-width="2"/>
    <line x1="0" y1="${header}" x2="${width}" y2="${header}" stroke="#444" stroke-width="2"/>
    <line x1="${split}" y1="0" x2="${split}" y2="${height}" stroke="#b5b5b5" stroke-width="2"/>
    ${content}</svg>`;
}

async function freeWriteupBoardPayload(rows, date) {
  const previews = publicPreviews(rows, date);
  if (!previews.length) return null;
  const payloads = [];
  for (let offset = 0; offset < previews.length; offset += 12) {
    const page = Math.floor(offset / 12) + 1;
    const name = `writeups-${date}-${page}.png`;
    const attachment = await sharp(Buffer.from(freeWriteupTableSvg(previews.slice(offset, offset + 12)))).png().toBuffer();
    payloads.push({ allowedMentions: { parse: [] }, attachments: [],
      files: [{ attachment, name, description: 'Two-column writeup table. Player and team identities are hidden; prop lines and short source-backed breakdowns are visible.' }],
      embeds: [{ color: 0xFF7900, title: `Today's writeups · ${date}`,
        description: 'Player and team names hidden. Full breakdowns in VIP.',
        image: { url: `attachment://${name}` },
        footer: { text: `${FREE_BOARD_MARKER} · ${date} · ${page}` }
      }]
    });
  }
  return payloads;
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
    const payload = await freeWriteupBoardPayload(rows, date);
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
      const signature = createHash('sha256').update(JSON.stringify(item.embeds)).update(item.files[0].attachment).digest('hex');
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

module.exports = { FREE_BOARD_MARKER, createFreeWriteupBoard, freeWriteupBoardPayload, freeWriteupTableSvg, publicPreviews };
