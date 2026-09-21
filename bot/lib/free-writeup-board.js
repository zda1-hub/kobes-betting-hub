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
    [/\b(?:targets?|carries|snaps?|attempts?|usage|workload|opportunities)\b/, 'Usage and opportunity'],
    [/\b(?:last|recent|season|games?|weeks?|averag\w*|form)\b/, 'Recent production'],
    [/\b(?:defense|opponent|matchup|coverage|rank\w*|allowed)\b/, 'Matchup context'],
    [/\b(?:injur\w*|questionable|availability|absence|inactive)\b/, 'Availability context']
  ].filter(([pattern]) => pattern.test(source)).slice(0, 3).map(([, label]) => label);
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
    return { number: index + 1, emoji, sport, topics: safeEvidenceTopics(row) };
  });
}

function freeWriteupBoardPayload(rows, date) {
  const previews = publicPreviews(rows, date);
  if (!previews.length) return null;
  const lines = previews.map(({ number, emoji, topics }) =>
    `**${emoji} PLAY ${number} · EXACT PICK HIDDEN**\n• ${topics.length ? `Research covers ${topics.join(', ').toLowerCase()}.` : 'Full supporting research is in VIP.'} No names, teams, or bet terms shown here.`);
  const description = [
    '**Today’s plays:**',
    ...lines,
    '🔒 **See the exact plays and full writeups in VIP.**'
  ].join('\n\n');
  if (description.length > 4000) throw new Error('Free writeup preview exceeds one Discord embed.');
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: 'Today’s Plays · Preview',
      description,
      footer: { text: `${FREE_BOARD_MARKER} · Exact plays remain in VIP` },
      timestamp: new Date().toISOString()
    }]
  };
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
  let reconciled = false;
  async function refresh() {
    const channel = await channelFor();
    const date = operatingDate();
    const rows = await rowsFor();
    const payload = freeWriteupBoardPayload(rows, date);
    const previews = publicPreviews(rows, date);
    const state = await readState(stateFile);
    // Deploys can start with an empty local state file. Recover the bot's
    // existing public board by its footer instead of publishing a duplicate.
    if (!reconciled) {
      const recent = await channel.messages.fetch({ limit: 50 });
      const boards = [...recent.values()].filter((message) =>
        message.author?.id === channel.client?.user?.id &&
        message.embeds?.some((embed) => String(embed.footer?.text || '').includes(FREE_BOARD_MARKER))
      ).sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
      if (boards.length) {
        const [newest, ...duplicates] = boards;
        state.message_id = newest.id;
        state.date = date;
        for (const duplicate of duplicates) await duplicate.delete();
      }
      reconciled = true;
    }
    if (state.message_id && state.date !== date) {
      const prior = await channel.messages.fetch(state.message_id).catch(() => null);
      if (prior) await prior.delete();
      delete state.message_id;
      delete state.date;
    }
    if (!payload) {
      await syncSite({ date, previews: [] });
      await writeState(stateFile, state);
      return { status: 'EMPTY', date, previews: 0 };
    }
    const current = state.date === date && state.message_id
      ? await channel.messages.fetch(state.message_id).catch(() => null)
      : null;
    const message = current ? await current.edit(payload) : await channel.send(payload);
    await writeState(stateFile, { date, message_id: message.id, updated_at: new Date().toISOString() });
    await syncSite({ date, previews });
    return { status: current ? 'UPDATED' : 'CREATED', date, messageId: message.id,
      previews: rows.filter((row) => row.operating_date === date && isWriteup(row)).length };
  }
  return { refresh };
}

module.exports = { FREE_BOARD_MARKER, createFreeWriteupBoard, freeWriteupBoardPayload, publicPreviews };
