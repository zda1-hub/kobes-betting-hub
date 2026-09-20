const fs = require('node:fs/promises');
const path = require('node:path');

const BOARD_MARKER = 'KBH daily-writeups-v1';

function isWriteup(row) {
  return row.status === 'PUBLISHED' && /writeups?/i.test(row.destination || '');
}

function sportLabel(row) {
  const value = `${row.sport || ''} ${row.league || ''}`.toLowerCase();
  if (/football|nfl|ncaaf/.test(value)) return '🏈 FOOTBALL';
  if (/baseball|mlb/.test(value)) return '⚾ BASEBALL';
  if (/basketball|nba|wnba|ncaab/.test(value)) return '🏀 BASKETBALL';
  if (/hockey|nhl/.test(value)) return '🏒 HOCKEY';
  if (/soccer|mls/.test(value)) return '⚽ SOCCER';
  return '🎯 OTHER';
}

function wagerLine(row) {
  const selection = String(row.selection || '').trim();
  const line = String(row.published_line || '').trim();
  const odds = String(row.published_odds_american || '').trim();
  const normalizedSelection = selection.toLowerCase().replace(/[^a-z0-9.+-]+/g, ' ').trim();
  const normalizedLine = line.toLowerCase().replace(/[^a-z0-9.+-]+/g, ' ').trim();
  const visibleLine = normalizedLine && !normalizedSelection.includes(normalizedLine) ? line : '';
  return [selection, visibleLine, odds].filter(Boolean).join(' ');
}

function dailyWriteupBoardPayload(rows, date) {
  const groups = new Map();
  for (const row of rows.filter(row => row.operating_date === date && isWriteup(row))) {
    const label = sportLabel(row);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(`• ${wagerLine(row) || 'Published wager terms unavailable'}`);
  }
  const description = [...groups.entries()].map(([label, wagers]) => `**${label}**\n${wagers.join('\n')}`).join('\n\n');
  if (!description) return null;
  if (description.length > 4000) throw new Error('Daily writeup board exceeds one Discord embed; keep the existing board until it can be reviewed safely.');
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: '📋 Today’s Writeups',
      description,
      footer: { text: `${BOARD_MARKER} · Updates after each Kobe-approved writeup` },
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

function createDailyWriteupBoard({ channelFor, rowsFor, stateFile, operatingDate }) {
  async function refresh() {
    const channel = await channelFor();
    const date = operatingDate();
    const state = await readState(stateFile);
    const payload = dailyWriteupBoardPayload(await rowsFor(), date);

    if (state.message_id && state.date !== date) {
      const prior = await channel.messages.fetch(state.message_id).catch(() => null);
      if (prior) await prior.delete();
      await writeState(stateFile, {});
    }
    if (!payload) return { status: 'EMPTY', date };

    const current = state.date === date && state.message_id
      ? await channel.messages.fetch(state.message_id).catch(() => null)
      : null;
    const message = current ? await current.edit(payload) : await channel.send(payload);
    await writeState(stateFile, { date, message_id: message.id, updated_at: new Date().toISOString() });
    return { status: current ? 'UPDATED' : 'CREATED', date, messageId: message.id };
  }
  return { refresh };
}

module.exports = { BOARD_MARKER, createDailyWriteupBoard, dailyWriteupBoardPayload };
