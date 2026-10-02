const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { expertName } = require('./vip-expert-list');

const MARKER = 'KBH expert-pulse-v1';
const REVIEW_MARKER = 'KBH expert-pulse-review-v1';
const MANUAL_MARKER = 'KBH manual-expert-v1';
const OPERATING_TIME_ZONE = 'America/Phoenix';

function operatingDate(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function keyFor(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function expertId(name) {
  return createHash('sha256').update(keyFor(name)).digest('hex').slice(0, 16);
}

function manualSubmission(name, message) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const cleanMessage = String(message || '').replace(/\r\n?/g, '\n').trim();
  if (cleanName.length < 3 || cleanName.length > 80 || !/[a-z]{2}/i.test(cleanName)
    || /@everyone|@here|<@|https?:\/\//i.test(cleanName)) throw new Error('Enter a capper name of 3–80 characters.');
  if (cleanMessage.length > 1500) throw new Error('Keep the capper message under 1,500 characters.');
  if (/@everyone|@here|<@/i.test(cleanMessage)) throw new Error('Remove mentions from the capper message.');
  return { name: cleanName, message: cleanMessage };
}

function manualPayload(entry, status = 'PENDING') {
  const description = entry.message || 'Name submitted without additional notes.';
  return {
    allowedMentions: { parse: [] },
    content: status === 'PENDING' ? 'Manual capper submission · awaiting Kobe’s decision. No win rate has been verified.'
      : status === 'REJECTED' ? 'Manual capper submission rejected. Nothing was posted to VIP.'
        : 'Kobe-approved manual capper submission. No win rate has been verified.',
    embeds: [{ color: 0xFF7900, title: entry.name, description,
      footer: { text: `${MANUAL_MARKER} · ${entry.id} · ${status.toLowerCase()}` } }],
    components: status === 'PENDING' ? [{ type: 1, components: [
      { type: 2, style: 3, label: 'Approve for VIP', custom_id: `expert-manual:approve:${entry.id}` },
      { type: 2, style: 4, label: 'Reject', custom_id: `expert-manual:reject:${entry.id}` }
    ] }] : []
  };
}

function verifiedRecords(rows, paidChannelIds) {
  const channels = new Set([...paidChannelIds].map(String));
  const eligible = rows.filter((row) => {
    const published = Date.parse(row.published_at || '');
    const reference = String(row.post_reference || '');
    const channelId = reference.match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/)?.[1];
    return ['PUBLISHED', 'GRADED'].includes(row.status)
      && channels.has(channelId)
      && row.wager_scope === 'individual'
      && ['W', 'L', 'P', 'V'].includes(String(row.result || '').toUpperCase())
      && /^https?:\/\/\S+/.test(String(row.result_verified_source || '').replace(/^Verified final result:\s*/i, ''))
      && Number.isFinite(Date.parse(row.result_verified_at || ''))
      && Number.isFinite(published)
      && keyFor(row.source_name);
  });
  const byExpert = new Map();
  const seen = new Set();
  for (const row of eligible) {
    if (seen.has(row.pick_id) || !row.pick_id) continue;
    seen.add(row.pick_id);
    const key = keyFor(row.source_name);
    const item = byExpert.get(key) || { name: row.source_name.trim(), wins: 0, losses: 0, pushes: 0, voids: 0, results: [], references: [] };
    const grade = row.result.toUpperCase();
    if (grade === 'W') item.wins += 1;
    if (grade === 'L') item.losses += 1;
    if (grade === 'P') item.pushes += 1;
    if (grade === 'V') item.voids += 1;
    item.results.push({ grade, at: Date.parse(row.published_at), reference: row.post_reference, sport: String(row.sport || row.league || '').trim().toLowerCase() });
    byExpert.set(key, item);
  }
  return [...byExpert.values()].map((item) => {
    item.results.sort((a, b) => b.at - a.at);
    item.references = item.results.map((row) => row.reference);
    item.streak = 0;
    for (const at of [...new Set(item.results.map((row) => row.at))]) {
      const settledTogether = item.results.filter((row) => row.at === at);
      // Picks published at the same instant have no knowable within-card
      // order. Any loss in that card breaks the streak before wins count.
      if (settledTogether.some((row) => row.grade === 'L')) break;
      item.streak += settledTogether.filter((row) => row.grade === 'W').length;
    }
    return item;
  }).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || b.wins - a.wins || a.name.localeCompare(b.name));
}

function selections(message) {
  if (!expertName(message)) return [];
  const text = [message.content, ...(message.embeds || []).map((embed) => embed.description || '')].filter(Boolean).join('\n');
  return text.split(/\r?\n/).slice(1)
    .map((line) => line.match(/^\s*[-•*]\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((line) => line && line.length >= 8 && line.length <= 180 && !/https?:\/\/|@everyone|@here/i.test(line));
}

function summary(messages, now = Date.now()) {
  const today = operatingDate(now);
  const recent = messages.filter((message) => {
    const at = message.createdTimestamp ?? new Date(message.createdAt).getTime();
    return Number.isFinite(at) && at <= now && operatingDate(at) === today;
  });
  const sources = new Map();
  const repeated = new Map();
  let playCount = 0;
  for (const message of recent) {
    const source = expertName(message);
    if (!source) continue;
    const plays = selections(message);
    if (!plays.length) continue;
    sources.set(source.toLowerCase(), { name: source, count: (sources.get(source.toLowerCase())?.count || 0) + plays.length });
    for (const play of plays) {
      playCount += 1;
      const key = play.toLowerCase().replace(/\s+/g, ' ');
      repeated.set(key, { play, count: (repeated.get(key)?.count || 0) + 1 });
    }
  }
  return {
    date: today,
    playCount,
    sourceCount: sources.size,
    active: [...sources.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    repeated: [...repeated.values()].filter((row) => row.count > 1).sort((a, b) => b.count - a.count || a.play.localeCompare(b.play)).slice(0, 5)
  };
}

function payloadFor(report, records = [], { omitEmpty = false } = {}) {
  const firstTracked = records.flatMap((row) => row.results.map((result) => result.at))
    .reduce((earliest, at) => Math.min(earliest, at), Infinity);
  const coverage = Number.isFinite(firstTracked) ? `since ${new Date(firstTracked).toISOString().slice(0, 10)}` : 'no settled history';
  const end = Date.parse(`${report.date}T07:00:00Z`);
  const day = 86400000;
  const recordWithin = (expert, start, finish) => {
    const decisions = expert.results.filter((item) => item.at >= start && item.at < finish && ['W', 'L'].includes(item.grade));
    const wins = decisions.filter((item) => item.grade === 'W').length;
    const losses = decisions.length - wins;
    return { wins, losses, decisions: decisions.length, rate: decisions.length ? wins / decisions.length : 0 };
  };
  const percentage = (rate) => `${Number((rate * 100).toFixed(1))}%`;
  const format = ({ name, wins, losses, rate }) => `${name} (${wins}-${losses}, ${percentage(rate)})`;
  const ranked = (rows) => rows.sort((a, b) => b.rate - a.rate || b.wins - a.wins || a.name.localeCompare(b.name));
  const yesterday = ranked(records.map((expert) => ({ name: expert.name, references: expert.references, ...recordWithin(expert, end - day, end) }))
    .filter((item) => item.decisions && item.rate > 0.61));
  const fiveDays = ranked(records.map((expert) => ({ name: expert.name, references: expert.references, ...recordWithin(expert, end - 5 * day, end) }))
    .filter((item) => item.decisions && item.rate > 0.61));
  const sportRecords = (pattern) => ranked(records.map((expert) => {
    const decisions = expert.results.filter((item) => ['W', 'L'].includes(item.grade) && pattern.test(item.sport));
    const wins = decisions.filter((item) => item.grade === 'W').length;
    const losses = decisions.length - wins;
    return { name: expert.name, wins, losses, decisions: decisions.length,
      rate: decisions.length ? wins / decisions.length : 0 };
  }).filter((item) => item.decisions && item.rate > 0.60));
  const football = sportRecords(/^(?:football|nfl|ncaaf|americanfootball)/);
  const baseball = sportRecords(/^(?:baseball|mlb)/);
  const allTime = ranked(records.map((expert) => ({ name: expert.name, wins: expert.wins, losses: expert.losses,
    rate: expert.wins + expert.losses ? expert.wins / (expert.wins + expert.losses) : 0, references: expert.references }))
    .filter((item) => item.wins + item.losses > 0 && item.rate > 0.61));
  const lines = (items, mapper = format) => {
    if (!items.length) return 'No verified expert currently meets this threshold.';
    return items.map(mapper).join('\n');
  };
  const sections = [
    ['Yesterday’s best plays · over 61%', lines(yesterday)],
    ['Best records last 5 days · over 61%', lines(fiveDays)],
    ['Best football records · over 60% all time', lines(football)],
    ['Best baseball records · over 60% all time', lines(baseball)],
    ['Best records ever · over 61%', lines(allTime)]
  ].filter(([, body]) => !omitEmpty || body !== 'No verified expert currently meets this threshold.');
  const descriptions = [];
  let current = '';
  for (const [heading, body] of sections) {
    for (const line of [`**${heading}**`, ...body.split('\n'), '']) {
      if (current.length + line.length + 1 > 3500) {
        descriptions.push(current.trim());
        current = '';
      }
      current += `${line}\n`;
    }
  }
  if (current.trim()) descriptions.push(current.trim());
  if (descriptions.length > 10 || descriptions.reduce((total, item) => total + item.length, 0) > 6000)
    throw new Error('Expert list exceeds Discord’s message limit; no names were silently omitted.');
  return {
    allowedMentions: { parse: [] },
    expertNames: [...new Set([...yesterday, ...fiveDays, ...football, ...baseball, ...allTime].map((item) => item.name))],
    embeds: descriptions.map((description, index) => ({
      color: 0xFF7900,
      title: index ? 'Expert Cheat Sheet · continued' : 'Expert Cheat Sheet',
      description,
      ...(index === 0 ? { footer: { text: `${MARKER} · Verified paid pick log · ${coverage}` } } : {})
    }))
  };
}

function createExpertPulse({ sourceChannelFor, reviewChannelFor, destinationChannelFor,
  rowsFor = async () => [], paidChannelIds = [], isApprover = () => false, stateFile, legacyStateFile, now = () => Date.now() }) {
  if (!reviewChannelFor || !destinationChannelFor || !stateFile) throw new Error('Private expert pulse review, VIP destination, and state file are required.');
  let queue = Promise.resolve();
  function locked(action) {
    const run = queue.then(action, action);
    queue = run.catch(() => {});
    return run;
  }
  async function readState() {
    try {
      const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      // Adopt the original auto-published pulse rather than creating a second
      // VIP message when the approval-gated version is first deployed.
      if (!state.posted_message_id && state.message_id) state.posted_message_id = state.message_id;
      return state;
    }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function writeState(state) {
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, stateFile);
  }
  async function channels() {
    const [source, review, destination] = await Promise.all([sourceChannelFor(), reviewChannelFor(), destinationChannelFor()]);
    if (!source.guild?.id || source.guild.id !== review.guild?.id || source.guild.id !== destination.guild?.id
      || review.id === source.id || review.id === destination.id) {
      throw new Error('Expert pulse review must be separate from the source and VIP destination in the same server.');
    }
    for (const [name, channel] of [['review', review], ['VIP destination', destination]]) {
      if (channel.permissionsFor(channel.guild.roles.everyone)?.has('ViewChannel') !== false) {
        throw new Error(`Expert pulse ${name} privacy could not be verified; refusing to publish VIP selections.`);
      }
    }
    return { source, review, destination };
  }
  async function candidate(source) {
    const messages = [];
    let before;
    for (let page = 0; page < 20; page += 1) {
      const batch = await source.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      messages.push(...batch.values());
      if (batch.size < 100 || [...batch.values()].every((message) => operatingDate(message.createdTimestamp || 0) !== operatingDate(now()))) break;
      before = batch.last().id;
    }
    const rows = await rowsFor();
    const channels = typeof paidChannelIds === 'function' ? paidChannelIds() : paidChannelIds;
    const report = summary(messages, now());
    const records = verifiedRecords(rows, channels);
    const { expertNames: names, ...payload } = payloadFor(report, records);
    const digest = createHash('sha256').update(payload.embeds.map((embed) => `${embed.title}\n${embed.description}`).join('\n')).digest('hex').slice(0, 20);
    const items = new Map();
    for (const name of names) {
      const key = expertId(name);
      const { expertNames, ...payload } = payloadFor(report, records.filter((record) => expertId(record.name) === key), { omitEmpty: true });
      const digest = createHash('sha256').update(payload.embeds.map((embed) => `${embed.title}\n${embed.description}`).join('\n')).digest('hex').slice(0, 20);
      items.set(key, { key, name, payload, digest });
    }
    return { items, report, records, payload, digest };
  }
  function reviewPayload(snapshot, state) {
    const { items, digest, payload } = snapshot;
    const pageCount = Math.max(1, Math.ceil(items.size / 25));
    const page = Math.max(0, Math.min(state.page || 0, pageCount - 1));
    const entries = [...items.values()];
    const visible = entries.slice(page * 25, (page + 1) * 25)
      .filter((item) => state.experts[item.key]?.status === 'PENDING');
    const approved = entries.filter((item) => state.experts[item.key]?.status === 'APPROVED').length;
    const rejected = entries.filter((item) => state.experts[item.key]?.status === 'REJECTED').length;
    const options = visible.map((item) => ({ label: item.name.slice(0, 100), value: item.key }));
    const components = [];
    if (options.length) {
      components.push({ type: 1, components: [{ type: 3, custom_id: `expert-pulse:approve:${digest}:${page}`,
        placeholder: 'Approve one expert for VIP', min_values: 1, max_values: 1, options }] });
      components.push({ type: 1, components: [{ type: 3, custom_id: `expert-pulse:reject:${digest}:${page}`,
        placeholder: 'Reject one expert', min_values: 1, max_values: 1, options }] });
      components.push({ type: 1, components: [
        { type: 2, style: 3, label: 'Approve All', custom_id: `expert-pulse:approve-all:${digest}:${page}` }
      ] });
    }
    components.push({ type: 1, components: [
      { type: 2, style: 2, label: 'Previous', custom_id: `expert-pulse:page:${digest}:${page - 1}`, disabled: page === 0 },
      { type: 2, style: 2, label: 'Next', custom_id: `expert-pulse:page:${digest}:${page + 1}`, disabled: page >= pageCount - 1 },
      { type: 2, style: 2, label: 'Refresh', custom_id: `expert-pulse:refresh:${digest}:${page}` },
      { type: 2, style: 1, label: 'Edit Kobe note', custom_id: `expert-pulse:edit:${digest}:${page}` },
      { type: 2, style: 2, label: 'Submit capper', custom_id: `expert-pulse:submit:${digest}:${page}` }
    ] });
    return {
      allowedMentions: { parse: [] },
      content: `Expert cheat sheet review · ${approved} approved · ${rejected} rejected · ${items.size - approved - rejected} pending · page ${page + 1}/${pageCount}. Use Approve All to approve every pending expert on this sheet, or choose a single expert under Approve or Reject. Rejected experts stay excluded. Only approved experts appear in VIP.${state.editor_note ? `\n\n**Kobe’s note:** ${state.editor_note}` : ''}`,
      embeds: payload.embeds.map((embed, index) => index === 0
        ? { ...embed, title: 'Review Expert Cheat Sheet', footer: { text: `${REVIEW_MARKER} · aggregate · ${digest}` } }
        : embed),
      components
    };
  }
  async function managedVipMessage(destination, id, aggregate = false) {
    if (!id) return null;
    let message;
    try { message = await destination.messages.fetch(id); }
    catch (error) {
      // Discord 10008 means this exact message was deleted. Permission and
      // network errors must still stop publication rather than look deleted.
      if (error.code === 10008 || error.rawError?.code === 10008) return null;
      throw error;
    }
    const marker = aggregate ? `${MARKER} · aggregate ·` : MARKER;
    if (message && !message.embeds?.some((embed) => embed.footer?.text?.includes(marker))) {
      throw new Error('Stored expert pulse VIP message is not managed by this publisher.');
    }
    return message;
  }
  async function migrateState(state, destination) {
    if (state.version === 3) return state;
    const experts = state.experts || {};
    const oldCards = Object.values(experts).map((entry) => entry.review_message_id).filter(Boolean);
    const reviewId = oldCards[0] || state.review_message_id || null;
    const oldPosts = Object.values(experts).map((entry) => entry.posted_message_id).filter(Boolean);
    if (state.posted_message_id) oldPosts.push(state.posted_message_id);
    for (const [key, entry] of Object.entries(experts)) {
      if (entry.status !== 'PUBLISHING') continue;
      const recent = await destination.messages.fetch({ limit: 100 });
      const found = [...recent.values()].find((message) => message.embeds?.some((embed) =>
        embed.footer?.text?.includes(`${MARKER} · ${key} · ${entry.digest}`)));
      if (found) {
        oldPosts.push(found.id);
        entry.status = 'APPROVED';
      } else entry.status = 'PENDING';
    }
    state = { version: 3, digest: null, page: 0, review_message_id: reviewId,
      review_status: 'IDLE', vip_message_id: null, vip_status: 'IDLE', experts,
      editor_note: state.editor_note || '',
      legacy_review_message_ids: [...new Set(oldCards.filter((id) => id !== reviewId))],
      legacy_vip_message_ids: [...new Set(oldPosts)] };
    await writeState(state);
    return state;
  }
  async function syncVip(snapshot, state, destination) {
    const approved = snapshot.records.filter((record) => {
      const key = expertId(record.name);
      return state.experts[key]?.status === 'APPROVED'
        && state.experts[key]?.digest === snapshot.items.get(key)?.digest;
    });
    let existing = await managedVipMessage(destination, state.vip_message_id, true);
    if (state.vip_message_id && !existing) {
      // Fetching the stored ID returned Discord's Unknown Message error.
      // Reuse any managed aggregate still visible before clearing the stale ID.
      const recent = await destination.messages.fetch({ limit: 100 });
      existing = [...recent.values()].find((message) => message.embeds?.some((embed) =>
        embed.footer?.text?.includes(`${MARKER} · aggregate ·`))) || null;
      state.vip_message_id = existing?.id || null;
      state.vip_status = 'IDLE';
      await writeState(state);
    }
    if (!existing && !state.vip_message_id) {
      const recent = await destination.messages.fetch({ limit: 100 });
      existing = [...recent.values()].find((message) => message.embeds?.some((embed) =>
        embed.footer?.text?.includes(`${MARKER} · aggregate ·`))) || null;
      if (existing) {
        state.vip_message_id = existing.id;
        state.vip_status = 'IDLE';
        await writeState(state);
      }
    }
    if (state.vip_status === 'SENDING' && !existing) {
      throw new Error('Combined VIP publication receipt is uncertain; inspect Discord before retrying.');
    }
    if (!approved.length) {
      if (existing) await existing.delete();
      state.vip_message_id = null;
      state.vip_status = 'IDLE';
      await writeState(state);
      return null;
    }
    const { expertNames, ...payload } = payloadFor(snapshot.report, approved);
    payload.content = state.editor_note ? `**Kobe’s note:** ${state.editor_note}` : '';
    const digest = createHash('sha256').update(payload.embeds.map((embed) => embed.description).join('\n')).digest('hex').slice(0, 20);
    payload.embeds[0] = { ...payload.embeds[0], footer: { text: `${MARKER} · aggregate · ${digest}` } };
    if (existing && existing.content === payload.content && existing.embeds?.[0]?.footer?.text === payload.embeds[0].footer.text
      && existing.embeds?.map((embed) => embed.description).join('\n') === payload.embeds.map((embed) => embed.description).join('\n')) return existing.id;
    if (!existing) {
      state.vip_status = 'SENDING';
      await writeState(state);
    }
    const posted = existing ? await existing.edit(payload) : await destination.send(payload);
    state.vip_message_id = posted.id;
    state.vip_status = 'IDLE';
    await writeState(state);
    return posted.id;
  }
  async function refreshUnlocked() {
    const { source, review, destination } = await channels();
    const snapshot = await candidate(source);
    let state = await migrateState(await readState(), destination);
    let changed = false;
    // A new private cheat-sheet channel uses a new state file. Carry Kobe's
    // decisions forward only when the exact expert content still matches.
    if (legacyStateFile) {
      let legacy;
      try { legacy = JSON.parse(await fs.readFile(legacyStateFile, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      for (const [key, item] of snapshot.items) {
        const prior = legacy?.experts?.[key];
        const current = state.experts?.[key];
        if (prior?.digest === item.digest && ['APPROVED', 'REJECTED'].includes(prior.status)
          && (!current || current.status === 'PENDING')) {
          state.experts[key] = { name: item.name, digest: item.digest, status: prior.status };
          changed = true;
        }
      }
      if (!state.editor_note && legacy?.editor_note) {
        state.editor_note = legacy.editor_note;
        changed = true;
      }
    }
    for (const item of snapshot.items.values()) {
      const old = state.experts[item.key];
      if (!old || old.digest !== item.digest || !['PENDING', 'APPROVED', 'REJECTED'].includes(old.status)) {
        state.experts[item.key] = { name: item.name, digest: item.digest, status: 'PENDING' };
        changed = true;
      }
    }
    for (const key of Object.keys(state.experts)) {
      if (!snapshot.items.has(key)) {
        delete state.experts[key];
        changed = true;
      }
    }
    if (state.digest !== snapshot.digest) { state.digest = snapshot.digest; changed = true; }
    state.page = Math.max(0, Math.min(state.page || 0, Math.max(0, Math.ceil(snapshot.items.size / 25) - 1)));
    await writeState(state);
    const expected = reviewPayload(snapshot, state);
    let card = state.review_message_id ? await review.messages.fetch(state.review_message_id).catch(() => null) : null;
    if (!card && state.review_status === 'SENDING') {
      const recent = await review.messages.fetch({ limit: 100 });
      card = [...recent.values()].find((message) => message.embeds?.some((embed) =>
        embed.footer?.text?.includes(`${REVIEW_MARKER} · aggregate · ${state.digest}`))) || null;
      if (!card) throw new Error('Combined expert review receipt is uncertain; inspect Discord before retrying.');
    }
    if (!card && state.review_message_id) {
      throw new Error('Combined expert review message is missing or inaccessible; inspect Discord before retrying.');
    }
    if (card) {
      if (card.content !== expected.content || card.embeds?.[0]?.footer?.text !== expected.embeds[0].footer.text
        || JSON.stringify(card.components?.map((row) => typeof row.toJSON === 'function' ? row.toJSON() : row)) !== JSON.stringify(expected.components)) {
        await card.edit(expected);
        changed = true;
      }
      if (state.review_message_id !== card.id || state.review_status !== 'IDLE') {
        state.review_message_id = card.id;
        state.review_status = 'IDLE';
        await writeState(state);
      }
    } else {
      state.review_status = 'SENDING';
      await writeState(state);
      card = await review.send(expected);
      state.review_message_id = card.id;
      state.review_status = 'IDLE';
      await writeState(state);
      changed = true;
    }
    await syncVip(snapshot, state, destination);
    for (const id of state.legacy_vip_message_ids || []) {
      const oldPost = await managedVipMessage(destination, id);
      if (oldPost) await oldPost.delete();
      state.legacy_vip_message_ids = state.legacy_vip_message_ids.filter((item) => item !== id);
      await writeState(state);
      changed = true;
    }
    for (const id of state.legacy_review_message_ids || []) {
      const oldCard = await review.messages.fetch(id).catch(() => null);
      if (oldCard) await oldCard.delete();
      state.legacy_review_message_ids = state.legacy_review_message_ids.filter((item) => item !== id);
      await writeState(state);
      changed = true;
    }
    return { status: changed ? 'REVIEW_UPDATED' : 'UNCHANGED', expertCount: snapshot.items.size, messageId: card.id };
  }
  async function decideUnlocked({ customId, values = [], userId, ownerId, guildId, channelId, messageId }) {
    const match = String(customId).match(/^expert-pulse:(approve|reject|page|refresh):([a-f0-9]{20}):(-?\d+)$/);
    if (!match) throw new Error('This expert review card is outdated. Use the combined trends message.');
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can review this pulse.');
    const { source, review, destination } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id) throw new Error('Expert pulse action must come from the private review channel.');
    if (match[1] === 'refresh') return refreshUnlocked();
    const state = await readState();
    if (state.version !== 3 || messageId !== state.review_message_id || state.digest !== match[2]) {
      throw new Error('This combined expert review is stale. Refresh it before deciding.');
    }
    const snapshot = await candidate(source);
    if (snapshot.digest !== state.digest) {
      await refreshUnlocked();
      throw new Error('Expert data changed. Review the refreshed message before deciding.');
    }
    if (match[1] === 'page') {
      const target = Number(match[3]);
      const pages = Math.max(1, Math.ceil(snapshot.items.size / 25));
      if (target < 0 || target >= pages) throw new Error('That expert page is unavailable.');
      state.page = target;
      await writeState(state);
      const card = await review.messages.fetch(messageId);
      await card.edit(reviewPayload(snapshot, state));
      return { status: 'PAGE_CHANGED', page: target + 1, pages };
    }
    const page = Number(match[3]);
    if (page !== state.page || values.length !== 1) throw new Error('Choose one expert from the current page.');
    const key = String(values[0]);
    const visible = [...snapshot.items.values()].slice(page * 25, (page + 1) * 25);
    const item = visible.find((row) => row.key === key);
    const entry = state.experts[key];
    if (!item || !entry || entry.digest !== item.digest || entry.status !== 'PENDING') {
      throw new Error('This expert is stale or already decided.');
    }
    entry.status = match[1] === 'approve' ? 'APPROVED' : 'REJECTED';
    await writeState(state);
    if (entry.status === 'APPROVED') await syncVip(snapshot, state, destination);
    const card = await review.messages.fetch(messageId);
    await card.edit(reviewPayload(snapshot, state));
    return { status: entry.status === 'APPROVED' ? 'PUBLISHED' : 'REJECTED', expert: item.name };
  }
  async function approveAllUnlocked({ digest, page, confirmation, userId, ownerId, guildId, channelId, messageId }) {
    if (String(confirmation || '').trim().toUpperCase() !== 'APPROVE ALL')
      throw new Error('Type APPROVE ALL to confirm the full cheat sheet.');
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can approve this sheet.');
    const { source, review, destination } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id)
      throw new Error('Approve the sheet from the private review channel.');
    const state = await readState();
    if (state.version !== 3 || state.digest !== digest || state.page !== page || state.review_message_id !== messageId)
      throw new Error('This expert review changed. Refresh it before approving.');
    const snapshot = await candidate(source);
    if (snapshot.digest !== digest) {
      await refreshUnlocked();
      throw new Error('Expert data changed. Review the refreshed sheet before approving.');
    }
    let count = 0;
    for (const item of snapshot.items.values()) {
      const entry = state.experts[item.key];
      if (entry?.status === 'PENDING' && entry.digest === item.digest) {
        entry.status = 'APPROVED';
        count += 1;
      }
    }
    if (!count) throw new Error('There are no pending experts left to approve.');
    await writeState(state);
    await syncVip(snapshot, state, destination);
    const card = await review.messages.fetch(messageId);
    await card.edit(reviewPayload(snapshot, state));
    return { status: 'PUBLISHED', count };
  }
  async function editNoteUnlocked({ digest, note, userId, ownerId, guildId, channelId }) {
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can edit this note.');
    const { source, review } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id) throw new Error('Edit the cheat sheet from its private review channel.');
    const state = await readState();
    if (state.version !== 3 || state.digest !== digest) throw new Error('This expert cheat sheet changed. Refresh it before editing.');
    const cleaned = String(note || '').trim();
    if (cleaned.length > 500) throw new Error('Keep Kobe’s note under 500 characters.');
    state.editor_note = cleaned;
    await writeState(state);
    return refreshUnlocked();
  }
  async function submitManualUnlocked({ digest, name, message, userId, ownerId, guildId, channelId }) {
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can submit a capper.');
    const { source, review } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id) throw new Error('Submit cappers from the private expert review channel.');
    const submitted = manualSubmission(name, message);
    const state = await readState();
    if (state.version !== 3 || !state.review_message_id || state.digest !== digest)
      throw new Error('Refresh the expert cheat sheet before submitting a capper.');
    state.manual ||= {};
    const duplicate = Object.values(state.manual).find((entry) => keyFor(entry.name) === keyFor(submitted.name)
      && entry.message === submitted.message && entry.status !== 'REJECTED');
    if (duplicate) {
      if (duplicate.status === 'REVIEW_SENDING') {
        const recent = await review.messages.fetch({ limit: 100 });
        const card = [...recent.values()].find((item) => item.embeds?.some((embed) =>
          embed.footer?.text === `${MANUAL_MARKER} · ${duplicate.id} · pending`));
        if (!card) throw new Error('Review card delivery is uncertain. Check the private channel before retrying.');
        duplicate.review_message_id = card.id;
        duplicate.status = 'PENDING';
        await writeState(state);
      }
      return { status: 'DUPLICATE', name: duplicate.name };
    }
    const id = createHash('sha256').update(`${userId}\n${now()}\n${submitted.name}\n${submitted.message}`)
      .digest('hex').slice(0, 16);
    const entry = { id, ...submitted, status: 'REVIEW_SENDING', submitted_by: userId };
    state.manual[id] = entry;
    await writeState(state);
    const card = await review.send(manualPayload(entry));
    entry.review_message_id = card.id;
    entry.status = 'PENDING';
    await writeState(state);
    return { status: 'PENDING', name: entry.name, messageId: card.id };
  }
  async function decideManualUnlocked({ customId, userId, ownerId, guildId, channelId, messageId }) {
    const match = String(customId).match(/^expert-manual:(approve|reject):([a-f0-9]{16})$/);
    if (!match) throw new Error('This manual capper action is invalid.');
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can decide on a capper.');
    const { source, review, destination } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id) throw new Error('Decide from the private expert review channel.');
    const state = await readState();
    const entry = state.manual?.[match[2]];
    if (!entry || entry.review_message_id !== messageId) throw new Error('This capper review card is stale.');
    if (entry.status === 'APPROVED' || entry.status === 'REJECTED') return { status: entry.status, name: entry.name };
    const card = await review.messages.fetch(messageId).catch(() => null);
    if (!card?.embeds?.some((embed) => embed.footer?.text === `${MANUAL_MARKER} · ${entry.id} · pending`))
      throw new Error('The manual capper review card changed. Nothing was posted.');
    if (match[1] === 'reject') {
      if (entry.status !== 'PENDING') throw new Error('This capper submission needs attention before rejection.');
      entry.status = 'REJECTED';
      await writeState(state);
      await card.edit(manualPayload(entry, 'REJECTED'));
      return { status: 'REJECTED', name: entry.name };
    }
    if (!['PENDING', 'PUBLISHING'].includes(entry.status)) throw new Error('This capper submission needs attention before approval.');
    let posted = entry.vip_message_id ? await destination.messages.fetch(entry.vip_message_id).catch(() => null) : null;
    if (!posted) {
      const recent = await destination.messages.fetch({ limit: 100 });
      posted = [...recent.values()].find((item) => item.embeds?.some((embed) =>
        embed.footer?.text === `${MANUAL_MARKER} · ${entry.id} · approved`)) || null;
    }
    if (!posted && entry.status === 'PUBLISHING') throw new Error('VIP delivery is uncertain. Check the VIP channel before retrying.');
    if (!posted) {
      entry.status = 'PUBLISHING';
      await writeState(state);
      posted = await destination.send(manualPayload(entry, 'APPROVED'));
    }
    entry.vip_message_id = posted.id;
    entry.status = 'APPROVED';
    await writeState(state);
    await card.edit(manualPayload(entry, 'APPROVED'));
    return { status: 'APPROVED', name: entry.name };
  }
  return { refresh: () => locked(refreshUnlocked), decide: (args) => locked(() => decideUnlocked(args)),
    approveAll: (args) => locked(() => approveAllUnlocked(args)),
    editNote: (args) => locked(() => editNoteUnlocked(args)),
    submitManual: (args) => locked(() => submitManualUnlocked(args)),
    decideManual: (args) => locked(() => decideManualUnlocked(args)) };
}

module.exports = { MARKER, MANUAL_MARKER, createExpertPulse, manualPayload, manualSubmission,
  payloadFor, selections, summary, verifiedRecords };
