const fs = require('node:fs/promises');
const path = require('node:path');

const BOARD_MARKER = 'KBH daily-writeups-v1';
const ARCHIVE_MARKER = 'KBH nfl-writeups-archive-v1';

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

function normalizedWager(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9.+-]+/g, ' ').trim();
}

function manualFootballWriteupRow(message, operatingDate) {
  if (!message?.id || !message?.content || message.author?.bot) return null;
  const rawLines = String(message.content).split(/\r?\n/);
  const evidenceCount = rawLines.filter((line) => /^\s*[-•]\s*\S/.test(line)).length;
  const attachmentCount = Number(message.attachments?.size || message.attachments?.length || 0);
  if (evidenceCount < 2 && attachmentCount < 1) return null;
  const lines = rawLines
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);
  const pricePattern = /(?:\(|\s|^)[+−-]\d{3,4}(?:\s+[A-Z0-9.-]+)?\)?(?:\s|:|$)/i;
  const marketPattern = /\b(over|under|receptions?|rec(?:eiving)?\.?\s*yards?|rush(?:ing)?\.?\s*(?:yards?|attempts?)|attempts?|carries|yards?|touchdowns?|tds?|completions?|interceptions?|sacks?|targets?|longest\s+(?:reception|rush)|anytime\s+(?:touchdown|td)|to\s+score|moneyline|ml)\b|\b[ou]\s*\d|\b[ou]\d/i;
  const firstMarketIndex = lines.slice(0, 4).findIndex((line) => marketPattern.test(line));
  if (firstMarketIndex < 0) return null;
  let selection = lines[firstMarketIndex];
  if (firstMarketIndex > 0 && !marketPattern.test(lines[0]) && lines[0].length <= 80) selection = `${lines[0]} ${selection}`;
  if (!pricePattern.test(selection)) {
    const priceLine = lines.slice(firstMarketIndex + 1, firstMarketIndex + 3).find((line) => pricePattern.test(line));
    if (priceLine && priceLine.length <= 40) selection = `${selection} ${priceLine}`;
  }
  selection = selection.replace(/:\s*$/, '').replaceAll('−', '-').trim();
  const hasPrice = pricePattern.test(` ${selection} `);
  const hasMarket = marketPattern.test(selection);
  if (!hasPrice || !hasMarket || selection.length > 256) return null;
  return {
    pick_id: `discord-manual-${message.id}`,
    operating_date: operatingDate(message.createdAt || message.createdTimestamp),
    status: 'PUBLISHED', destination: '#football-writeups', sport: 'football', league: 'NFL',
    selection, published_line: '', published_odds_american: '', source_message_id: message.id, source_type: 'discord_manual',
    teaser_source: rawLines.filter((line) => /^\s*[-•]\s*\S/.test(line)).join('\n'),
  };
}

function dailyWriteupBoardPayload(rows, date) {
  const groups = new Map();
  const seen = new Set();
  for (const row of rows.filter(row => row.operating_date === date && isWriteup(row))) {
    const label = sportLabel(row);
    const wager = wagerLine(row) || 'Published wager terms unavailable';
    const key = `${label}:${normalizedWager(wager)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(`• ${wager}`);
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

function nflArchivePayloads(rows, currentDate) {
  const byDate = new Map();
  const seen = new Set();
  const eligible = rows.filter((row) => row.operating_date < currentDate && isWriteup(row)
    && /\bnfl\b/i.test(`${row.league || ''} ${row.sport || ''}`));
  for (const row of eligible.sort((a, b) => String(b.operating_date).localeCompare(String(a.operating_date)))) {
    const wager = wagerLine(row) || 'Published wager terms unavailable';
    const key = `${row.operating_date}:${normalizedWager(wager)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byDate.has(row.operating_date)) byDate.set(row.operating_date, []);
    byDate.get(row.operating_date).push(`• ${wager}`);
  }
  const sections = [...byDate.entries()].map(([date, wagers]) => `**${date}**\n${wagers.join('\n')}`);
  const chunks = [];
  for (const section of sections) {
    if (!chunks.length) {
      chunks.push(section);
      continue;
    }
    const candidate = `${chunks.at(-1)}\n\n${section}`;
    if (candidate.length <= 3900) chunks[chunks.length - 1] = candidate;
    else chunks.push(section);
  }
  return chunks.map((description, index) => ({
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: `🏈 NFL Writeups Archive${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`,
      description,
      footer: { text: `${ARCHIVE_MARKER} · Previous-day NFL picks` },
    }],
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

function createDailyWriteupBoard({ channelFor, rowsFor, stateFile, operatingDate }) {
  async function refresh() {
    const channel = await channelFor();
    const date = operatingDate();
    const state = await readState(stateFile);
    const rows = await rowsFor();
    const payload = dailyWriteupBoardPayload(rows, date);
    const archivePayloads = nflArchivePayloads(rows, date);

    if (state.message_id && state.date !== date) {
      const prior = await channel.messages.fetch(state.message_id).catch(() => null);
      if (prior) await prior.delete();
      delete state.message_id;
      delete state.date;
    }

    const archiveSignature = JSON.stringify(archivePayloads);
    if (state.archive_signature !== archiveSignature) {
      const priorIds = Array.isArray(state.archive_message_ids) ? state.archive_message_ids : [];
      const nextIds = [];
      for (let index = 0; index < archivePayloads.length; index += 1) {
        const prior = priorIds[index] ? await channel.messages.fetch(priorIds[index]).catch(() => null) : null;
        const message = prior ? await prior.edit(archivePayloads[index]) : await channel.send(archivePayloads[index]);
        nextIds.push(message.id);
      }
      for (const staleId of priorIds.slice(archivePayloads.length)) {
        const stale = await channel.messages.fetch(staleId).catch(() => null);
        if (stale) await stale.delete();
      }
      state.archive_message_ids = nextIds;
      state.archive_signature = archiveSignature;
    }
    if (!payload) {
      await writeState(stateFile, state);
      return { status: 'EMPTY', date, archiveMessages: state.archive_message_ids?.length || 0,
        archiveEntries: archivePayloads.reduce((count, item) => count + (item.embeds[0].description.match(/^• /gm) || []).length, 0),
        manualEntries: rows.filter((row) => row.source_type === 'discord_manual').length };
    }

    const current = state.date === date && state.message_id
      ? await channel.messages.fetch(state.message_id).catch(() => null)
      : null;
    const message = current ? await current.edit(payload) : await channel.send(payload);
    await writeState(stateFile, { ...state, date, message_id: message.id, updated_at: new Date().toISOString() });
    return { status: current ? 'UPDATED' : 'CREATED', date, messageId: message.id, archiveMessages: state.archive_message_ids?.length || 0,
      archiveEntries: archivePayloads.reduce((count, item) => count + (item.embeds[0].description.match(/^• /gm) || []).length, 0),
      manualEntries: rows.filter((row) => row.source_type === 'discord_manual').length };
  }
  return { refresh };
}

module.exports = { ARCHIVE_MARKER, BOARD_MARKER, createDailyWriteupBoard, dailyWriteupBoardPayload, manualFootballWriteupRow, nflArchivePayloads };
