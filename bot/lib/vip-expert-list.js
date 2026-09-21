const fs = require('node:fs/promises');
const path = require('node:path');

const MARKER = 'KBH vip-expert-list-v1';

function keyFor(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanName(value) {
  const name = String(value || '')
    .replace(/<@!?\d+>/g, '').replace(/[*_`~]/g, '').replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+\d+(?:\.\d+)?\s*u\s*max$/i, '').replace(/\s+/g, ' ').trim();
  return name.length >= 3 && name.length <= 60 && /[a-z]{2}/i.test(name) && !/https?:\/\/|@everyone|@here|[+-]\d+(?:\.\d+)?|\b(?:today|total|updated list|message me|over|under|moneyline|ml|vs)\b/i.test(name)
    ? name : '';
}

function messageText(message) {
  return [message.content, ...(message.embeds || []).map((embed) => embed.description || '')].filter(Boolean).join('\n');
}

function baselineNames(message) {
  if (!/updated list|cappers\/sources/i.test(messageText(message))) return [];
  return messageText(message).split(/\r?\n/).map((line) => line.match(/^\s*[-•*]\s+(.+?)\s*$/)?.[1])
    .map(cleanName).filter(Boolean);
}

function expertName(message) {
  const lines = messageText(message).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !/^[-•*]\s+\S/.test(lines[1])) return '';
  return cleanName(lines[0]);
}

function namesFromMessages(messages, baseline = []) {
  const names = new Map(baseline.map((name) => [keyFor(name), name]));
  for (const message of messages) {
    const name = expertName(message);
    if (name && !names.has(keyFor(name))) names.set(keyFor(name), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function payloadFor(names, originalCount) {
  if (!names.length) throw new Error('Cannot publish an empty VIP expert list.');
  const lines = names.map((name, index) => `${String(index + 1).padStart(2, '0')}. ${name}`);
  const chunks = [];
  for (const line of lines) {
    if (!chunks.length || `${chunks.at(-1)}\n${line}`.length > 3800) chunks.push(line);
    else chunks[chunks.length - 1] += `\n${line}`;
  }
  if (chunks.length > 10) throw new Error('VIP expert list exceeds Discord embed limit.');
  return {
    allowedMentions: { parse: [] },
    embeds: chunks.map((description, index) => ({
      color: 0xFF7900,
      title: `📋 VIP Expert List${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`,
      description,
      footer: { text: `${MARKER} · ${names.length} sources · Updates from #expert-picks` }
    })),
    content: `Current expert lineup: **${names.length} sources**. ${Math.max(0, names.length - originalCount)} added since Kobe’s original list. Prices in the earlier list are historical reference only; new sources have no verified standalone price.`
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

async function fetchHistory(channel, maxPages) {
  const messages = [];
  let before;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    messages.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last().id;
  }
  return messages;
}

function createVipExpertList({ sourceChannelFor, listChannelFor, stateFile }) {
  let initialized = false;
  let baseline = [];
  let discovered = [];
  async function refresh() {
    const [source, destination] = await Promise.all([sourceChannelFor(), listChannelFor()]);
    const state = await readState(stateFile);
    if (!initialized) {
      const listMessages = await destination.messages.fetch({ limit: 100 });
      baseline = [...listMessages.values()].map(baselineNames).find((names) => names.length >= 20) || [];
      if (!baseline.length) throw new Error('Kobe’s original VIP expert list was not found; no replacement posted.');
      if (!state.message_id) {
        const managed = [...listMessages.values()].find((message) => message.embeds?.some((embed) => embed.footer?.text?.includes(MARKER)));
        if (managed) state.message_id = managed.id;
      }
      discovered = Array.isArray(state.discovered) ? state.discovered : [];
      initialized = true;
    }
    const messages = await fetchHistory(source, state.message_id ? 1 : 20);
    const names = namesFromMessages(messages, [...baseline, ...discovered]);
    discovered = names.filter((name) => !baseline.some((item) => keyFor(item) === keyFor(name)));
    const payload = payloadFor(names, baseline.length);
    const signature = JSON.stringify([names, baseline.length]);
    const current = state.message_id ? await destination.messages.fetch(state.message_id).catch(() => null) : null;
    if (state.signature === signature && current) return { status: 'UNCHANGED', count: names.length, messageId: state.message_id };
    const message = current ? await current.edit(payload) : await destination.send(payload);
    await writeState(stateFile, { message_id: message.id, signature, discovered, updated_at: new Date().toISOString() });
    return { status: current ? 'UPDATED' : 'CREATED', count: names.length, additions: discovered.length, messageId: message.id };
  }
  return { refresh };
}

module.exports = { MARKER, baselineNames, cleanName, createVipExpertList, expertName, namesFromMessages, payloadFor };
