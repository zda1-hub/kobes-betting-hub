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

function freeWriteupBoardPayload(rows, date) {
  const eligible = [];
  const seen = new Set();
  for (const row of rows.filter((item) => item.operating_date === date && isWriteup(item))) {
    const key = privateWagerKey(row) || row.pick_id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    eligible.push(row);
  }
  if (!eligible.length) return null;
  const lines = eligible.map((row, index) => {
    const [emoji, sport] = sportLabel(row);
    const source = row.source_type === 'discord_manual' ? 'Kobe’s manual breakdown' : 'a fully reviewed writeup';
    return `**${emoji} PLAY ${index + 1}**\nA fresh ${sport} angle is live, backed by ${source}. The exact play, line, odds, and complete reasoning stay inside VIP.`;
  });
  const description = [
    `There ${eligible.length === 1 ? 'is' : 'are'} **${eligible.length} new writeup${eligible.length === 1 ? '' : 's'}** on today’s board. Here’s the preview without giving away the plays:`,
    ...lines,
    '🔒 **VIP members get every exact wager and the full supporting breakdown.**'
  ].join('\n\n');
  if (description.length > 4000) throw new Error('Free writeup preview exceeds one Discord embed.');
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: '🆓 Today’s Free Writeup Preview',
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

function createFreeWriteupBoard({ channelFor, rowsFor, stateFile, operatingDate }) {
  async function refresh() {
    const channel = await channelFor();
    const date = operatingDate();
    const rows = await rowsFor();
    const payload = freeWriteupBoardPayload(rows, date);
    const state = await readState(stateFile);
    if (state.message_id && state.date !== date) {
      const prior = await channel.messages.fetch(state.message_id).catch(() => null);
      if (prior) await prior.delete();
      delete state.message_id;
      delete state.date;
    }
    if (!payload) {
      await writeState(stateFile, state);
      return { status: 'EMPTY', date, previews: 0 };
    }
    const current = state.date === date && state.message_id
      ? await channel.messages.fetch(state.message_id).catch(() => null)
      : null;
    const message = current ? await current.edit(payload) : await channel.send(payload);
    await writeState(stateFile, { date, message_id: message.id, updated_at: new Date().toISOString() });
    return { status: current ? 'UPDATED' : 'CREATED', date, messageId: message.id,
      previews: rows.filter((row) => row.operating_date === date && isWriteup(row)).length };
  }
  return { refresh };
}

module.exports = { FREE_BOARD_MARKER, createFreeWriteupBoard, freeWriteupBoardPayload };
