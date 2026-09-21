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

function marketLabel(row) {
  const value = `${row.market || ''} ${row.selection || ''} ${row.published_line || ''}`.toLowerCase();
  if (/strikeouts?/.test(value)) return 'strikeouts';
  if (/receptions?/.test(value)) return 'receptions';
  if (/receiving yards?/.test(value)) return 'receiving yards';
  if (/rushing (?:yards?|attempts?)/.test(value)) return value.match(/rushing (?:yards?|attempts?)/)[0];
  if (/passing (?:yards?|attempts?|touchdowns?)/.test(value)) return value.match(/passing (?:yards?|attempts?|touchdowns?)/)[0];
  if (/touchdowns?/.test(value)) return 'touchdowns';
  if (/assists?/.test(value)) return 'assists';
  if (/rebounds?/.test(value)) return 'rebounds';
  if (/hits?/.test(value)) return 'hits';
  return 'player prop';
}

function safeFacts(row) {
  const selection = String(row.selection || '').toLowerCase();
  const line = String(row.published_line || '').match(/\d+(?:\.\d+)?/g) || [];
  const selectionNumbers = selection.match(/\d+(?:\.\d+)?/g) || [];
  const privateNumbers = [...new Set([...line, ...selectionNumbers].filter((number) => number.includes('.')))];
  return String(row.teaser_source || '').split(/\r?\n/)
    .filter((item) => /^\s*[-•]\s*\S/.test(item))
    .map((item) => item.replace(/^\s*[-•]\s*/, '').replace(/\*\*/g, '').trim())
    .filter((item) => item.length >= 24 && item.length <= 180)
    .filter((item) => !/\b(?:over|under|o|u)\s*\d|[+−-]\d{3,4}\b|https?:\/\/|@everyone|@here/i.test(item))
    .filter((item) => !privateNumbers.some((number) => new RegExp(`(^|\\D)${number.replace('.', '\\.')}($|\\D)`).test(item)))
    .filter((item) => !selection.includes(item.toLowerCase()))
    .slice(0, 2);
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
    const [emoji] = sportLabel(row);
    const facts = safeFacts(row);
    return `**${emoji} PLAY ${index + 1} · ████ ${marketLabel(row)}**\n${facts.length ? facts.map((fact) => `• ${fact}`).join('\n') : '• Full supporting stats and exact pick are in VIP.'}`;
  });
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
