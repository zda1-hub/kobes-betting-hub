const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isPublishedRow } = require('./recap');
const { distinctCapperWagers, verifiedResult } = require('./capper-recap');

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

function managedNames(message) {
  if (!message.embeds?.some((embed) => embed.footer?.text?.includes(MARKER))) return [];
  return message.embeds.flatMap((embed) => String(embed.description || '').split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+\.\s+(.+?)\s*$/)?.[1]?.split(' — ')[0]).map(cleanName).filter(Boolean));
}

function listMonth(message) {
  return messageText(message).match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i)?.[0] || '';
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

function previousMstDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  const yesterday = new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

function previousDayRecords(rows, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid expert record date.');
  const grouped = new Map();
  for (const row of rows) {
    if (row.operating_date !== date || !isPublishedRow(row)) continue;
    const key = keyFor(row.source_name);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return new Map([...grouped].map(([key, listed]) => {
    const counts = { W: 0, L: 0, P: 0, V: 0, PENDING: 0 };
    for (const { row } of distinctCapperWagers(listed)) counts[verifiedResult(row)]++;
    return [key, counts];
  }));
}

function recordLabel(counts) {
  if (!counts) return 'no verified results';
  const record = counts.W + counts.L ? `${counts.W}-${counts.L}` : 'no verified W/L';
  const notes = [counts.P && `${counts.P} push`, counts.V && `${counts.V} void`,
    counts.PENDING && `${counts.PENDING} pending`].filter(Boolean);
  return record + (notes.length ? ` (${notes.join(', ')})` : '');
}

function payloadsFor(names, { date, records = new Map() } = {}) {
  if (!names.length) throw new Error('Cannot publish an empty VIP expert list.');
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const lines = sorted.map((name, index) => `${String(index + 1).padStart(2, '0')}. ${name}${date ? ` — ${recordLabel(records.get(keyFor(name)))}` : ''}`);
  const chunks = [];
  for (const line of lines) {
    if (!chunks.length || `${chunks.at(-1)}\n${line}`.length > 3800) chunks.push(line);
    else chunks[chunks.length - 1] += `\n${line}`;
  }
  // Discord applies 6,000 characters across ALL embeds in a message.
  // One bounded embed per message keeps every expert and annotation intact.
  return chunks.map((description, index) => ({
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: `Current list of experts: ${names.length}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`,
      description,
      footer: { text: date ? `${MARKER} · ${date} verified W/L; pushes, voids and pending excluded.` : MARKER }
    }],
    content: ''
  }));
}

function payloadFor(names, options) {
  const payloads = payloadsFor(names, options);
  if (payloads.length !== 1) throw new Error('VIP expert list requires multiple messages; use payloadsFor.');
  return payloads[0];
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

function createVipExpertList({ sourceChannelFor, listChannelFor, stateFile, readRows, previousDate }) {
  let initialized = false;
  let baseline = [];
  let discovered = [];
  async function performRefresh() {
    const [source, destination] = await Promise.all([sourceChannelFor(), listChannelFor()]);
    const state = await readState(stateFile);
    if (!initialized) {
      const listMessages = await destination.messages.fetch({ limit: 100 });
      const original = [...listMessages.values()].find((message) => baselineNames(message).length >= 20);
      const managedMessages = [...listMessages.values()].filter(message => managedNames(message).length);
      const managed = managedMessages[0];
      baseline = original ? baselineNames(original) : managedMessages.flatMap(managedNames);
      if (!baseline.length) throw new Error('VIP expert list source was not found; no replacement posted.');
      if (!state.message_id) {
        if (managed) state.message_id = managed.id;
      }
      discovered = Array.isArray(state.discovered) ? state.discovered : [];
      initialized = true;
    }
    const messages = await fetchHistory(source, state.message_id ? 1 : 20);
    const names = namesFromMessages(messages, [...baseline, ...discovered]);
    discovered = names.filter((name) => !baseline.some((item) => keyFor(item) === keyFor(name)));
    const date = previousDate?.();
    const rows = readRows ? await readRows() : [];
    // Only the expert-picks destination supplies this list's public record.
    const scoped = rows.filter(row => String(row.post_reference).match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/)?.[1] === source.id);
    const records = date ? previousDayRecords(scoped, date) : new Map();
    const payloads = payloadsFor(names, { date, records });
    const signature = JSON.stringify(['records-messages-v2', payloads]);
    const revision = createHash('sha256').update(signature).digest('hex').slice(0, 20);
    const ids = Array.isArray(state.message_ids) ? [...state.message_ids] : state.message_id ? [state.message_id] : [];
    const save = async () => writeState(stateFile, { ...state, message_id: ids[0], message_ids: ids, discovered, updated_at: new Date().toISOString() });
    // A lost send response must be reconciled before any new sends, even if
    // the date/record revision has since changed.
    if (state.pending_part) {
      const history = await destination.messages.fetch({ limit: 100 });
      const recovered = [...history.values()].find(message => message.embeds?.some(embed => embed.footer?.text?.endsWith(state.pending_part.marker)));
      if (!recovered) throw new Error('VIP expert list send is uncertain; no duplicate sent. Check the list channel before retrying.');
      ids[state.pending_part.index] = recovered.id;
      delete state.pending_part;
      await save();
    }
    const current = await Promise.all(ids.map(id => destination.messages.fetch(id).catch(() => null)));
    if (state.signature === signature && current.length === payloads.length && current.every(Boolean))
      return { status: 'UNCHANGED', count: names.length, messageId: ids[0], messageIds: ids };
    for (let index = 0; index < payloads.length; index++) {
      const marker = `part:${revision}:${index}`;
      const payload = payloads[index];
      payload.embeds[0].footer.text += ` · ${marker}`;
      if (current[index]) await current[index].edit(payload);
      else {
        state.pending_part = { index, marker };
        await save();
        let message;
        try { message = await destination.send(payload); }
        catch (error) {
          // Discord's explicit authorization rejection proves no message was
          // accepted; do not leave a lost-response reservation for this case.
          if (error.code === 50013 || error.status === 403) {
            delete state.pending_part;
            await save();
            throw new Error(`Cannot send expert-list part ${index + 1}/${payloads.length} in channel ${destination.id || 'configured expert-list channel'}: Kobe Bot needs channel-specific Send Messages permission. Existing list parts were preserved.`, { cause: error });
          }
          throw error;
        }
        ids[index] = message.id;
        delete state.pending_part;
        await save();
      }
    }
    // A shorter list supersedes old extra parts without deleting messages.
    for (let index = payloads.length; index < ids.length; index++) {
      if (current[index]) await current[index].edit({ content: 'This expert-list part was superseded. Use the current list above.', embeds: [], allowedMentions: { parse: [] } });
    }
    ids.length = payloads.length;
    state.signature = signature;
    await save();
    return { status: current.some(Boolean) ? 'UPDATED' : 'CREATED', count: names.length, additions: discovered.length, messageId: ids[0], messageIds: ids };

  }
  let tail = Promise.resolve();
  return { refresh() {
    const run = tail.then(performRefresh);
    tail = run.catch(() => {});
    return run;
  } };
}

module.exports = { MARKER, baselineNames, cleanName, createVipExpertList, expertName, listMonth, managedNames, namesFromMessages, payloadFor, payloadsFor, previousDayRecords, recordLabel, previousMstDate };
