const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { expertName } = require('./vip-expert-list');

const MARKER = 'KBH expert-pulse-v1';
const REVIEW_MARKER = 'KBH expert-pulse-review-v1';
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
  const active = report.active.length
    ? report.active.map((row) => `${row.name}: ${row.count} posted selection${row.count === 1 ? '' : 's'}`).join('\n')
    : 'No qualifying expert posts today.';
  const repeated = report.repeated.length
    ? report.repeated.map((row) => `${row.count} posts - ${row.play}`).join('\n')
    : 'No identical selections repeated today.';
  const end = Date.parse(`${report.date}T07:00:00Z`);
  const day = 86400000;
  const recordWithin = (expert, start, finish) => {
    const decisions = expert.results.filter((item) => item.at >= start && item.at < finish && ['W', 'L'].includes(item.grade));
    const wins = decisions.filter((item) => item.grade === 'W').length;
    const losses = decisions.length - wins;
    return { wins, losses, decisions: decisions.length, rate: decisions.length ? wins / decisions.length : 0 };
  };
  const format = ({ name, wins, losses, rate }) => `${name} (${wins}-${losses}, ${Math.round(rate * 100)}%)`;
  const ranked = (rows) => rows.sort((a, b) => b.rate - a.rate || b.wins - a.wins || a.name.localeCompare(b.name));
  const yesterday = ranked(records.map((expert) => ({ name: expert.name, references: expert.references, ...recordWithin(expert, end - day, end) }))
    .filter((item) => item.decisions && item.rate > 0.61));
  const sevenDays = ranked(records.map((expert) => ({ name: expert.name, references: expert.references, ...recordWithin(expert, end - 7 * day, end) }))
    .filter((item) => item.decisions && item.rate > 0.60));
  const allTime = ranked(records.map((expert) => ({ name: expert.name, wins: expert.wins, losses: expert.losses,
    rate: expert.wins + expert.losses ? expert.wins / (expert.wins + expert.losses) : 0, references: expert.references }))
    .filter((item) => item.wins + item.losses > 0 && item.rate > 0.54));
  // A hot streak must reach yesterday, and must be checked
  // independently for each sport so a loss elsewhere does not hide it.
  const hot = records.flatMap((expert) => {
    const decisions = expert.results.filter((item) => ['W', 'L'].includes(item.grade) && item.at < end);
    const sports = [...new Set(decisions.map((item) => item.sport).filter(Boolean))];
    const scopes = [{ label: 'all sports', results: decisions },
      ...sports.map((sport) => ({ label: sport, results: decisions.filter((item) => item.sport === sport) }))];
    const streaks = scopes.map(({ label, results }) => {
      const byDate = new Map();
      for (const result of results) {
        const date = operatingDate(result.at);
        const grades = byDate.get(date) || [];
        grades.push(result.grade);
        byDate.set(date, grades);
      }
      let days = 0;
      while (true) {
        const date = operatingDate(end - (days + 1) * day);
        const grades = byDate.get(date);
        if (!grades || grades.includes('L') || !grades.includes('W')) break;
        days += 1;
      }
      return { name: expert.name, days, label };
    }).filter((item) => item.days >= 2);
    // One-sport records would otherwise repeat the identical streak twice.
    return sports.length === 1 && decisions.every((item) => item.sport === sports[0])
      ? streaks.filter((item) => item.label !== 'all sports') : streaks;
  }).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name) || a.label.localeCompare(b.label));
  const lines = (items, mapper = format) => {
    if (!items.length) return 'No verified expert currently meets this threshold.';
    return items.map(mapper).join('\n');
  };
  const sections = [
    ['Yesterday’s best · above 61%', lines(yesterday, (item) => `${item.name} (${item.wins}-${item.losses})`)],
    ['Hottest Experts · 2+ unbeaten days', lines(hot, (item) => `${item.name} (${item.days}-day unbeaten streak, ${item.label})`)],
    ['Best Exclusive records L7 days · above 60%', lines(sevenDays)],
    ['Best exclusive records ALL TIME · above 54%', lines(allTime)]
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
    expertNames: [...new Set([...yesterday, ...hot, ...sevenDays, ...allTime].map((item) => item.name))],
    embeds: descriptions.map((description, index) => ({
      color: 0xFF7900,
      title: index ? 'Expert Play Feedback · continued' : 'Expert Play Feedback',
      description,
      ...(index === 0 ? { footer: { text: `${MARKER} · Verified paid pick log · ${coverage}` } } : {})
    }))
  };
}

function createExpertPulse({ sourceChannelFor, reviewChannelFor, destinationChannelFor,
  rowsFor = async () => [], paidChannelIds = [], isApprover = () => false, stateFile, now = () => Date.now() }) {
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
    const names = payloadFor(report, records).expertNames;
    const items = new Map();
    for (const name of names) {
      const key = expertId(name);
      const { expertNames, ...payload } = payloadFor(report, records.filter((record) => expertId(record.name) === key), { omitEmpty: true });
      const digest = createHash('sha256').update(payload.embeds.map((embed) => `${embed.title}\n${embed.description}`).join('\n')).digest('hex').slice(0, 20);
      items.set(key, { key, name, payload, digest });
    }
    return items;
  }
  function reviewPayload(item, status) {
    const { key, name, digest, payload } = item;
    return {
      allowedMentions: { parse: [] },
      content: status === 'PENDING' ? `Private review for **${name}**: approve or reject this expert’s verified trends.`
        : status === 'REJECTED' ? `**${name}** rejected. This expert was not posted to VIP.`
          : status === 'APPROVED' ? `**${name}** approved and posted to VIP.`
            : `**${name}** no longer qualifies. This review is closed.`,
      embeds: payload.embeds.map((embed, index) => index === 0
        ? { ...embed, title: `Review Expert Trends · ${name}`, footer: { text: `${REVIEW_MARKER} · ${key} · ${digest}` } }
        : embed),
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: 'Approve for VIP', custom_id: `expert-pulse:approve:${key}:${digest}`, disabled: status !== 'PENDING' },
        { type: 2, style: 4, label: 'Reject', custom_id: `expert-pulse:reject:${key}:${digest}`, disabled: status !== 'PENDING' },
        { type: 2, style: 2, label: 'Refresh', custom_id: `expert-pulse:refresh:${key}:${digest}`, disabled: status === 'CLOSED' }
      ] }]
    };
  }
  async function managedVipMessage(destination, id, key) {
    if (!id) return null;
    const message = await destination.messages.fetch(id).catch(() => null);
    if (message && !message.embeds?.some((embed) => embed.footer?.text?.includes(key ? `${MARKER} · ${key} ·` : MARKER))) {
      throw new Error('Stored expert pulse VIP message is not managed by this publisher.');
    }
    return message;
  }
  async function refreshUnlocked() {
    const { source, review, destination } = await channels();
    const items = await candidate(source);
    let state = await readState();
    if (state.version !== 2) {
      state = { version: 2, experts: {}, legacy_review_message_id: state.review_message_id || null,
        legacy_posted_message_id: state.posted_message_id || null };
      await writeState(state);
    }
    let changed = false;
    for (const [key, item] of items) {
      let entry = state.experts[key] || {};
      if (entry.status === 'REVIEW_SENDING') {
        const recent = await review.messages.fetch({ limit: 100 });
        const found = [...recent.values()].find((message) => message.embeds?.some((embed) =>
          embed.footer?.text?.includes(`${REVIEW_MARKER} · ${key} · ${entry.digest}`)));
        if (!found) throw new Error(`Review-card receipt for ${entry.name} is uncertain; inspect Discord before retrying.`);
        entry = { ...entry, status: 'PENDING', review_message_id: found.id };
        state.experts[key] = entry;
        await writeState(state);
      }
      if (entry.status === 'PUBLISHING') {
        const existing = await managedVipMessage(destination, entry.posted_message_id, key);
        const recent = existing ? null : await destination.messages.fetch({ limit: 100 });
        const found = existing || [...recent.values()].find((message) => message.embeds?.some((embed) =>
          embed.footer?.text?.includes(`${MARKER} · ${key} · ${entry.digest}`)));
        if (!found || !found.embeds?.some((embed) => embed.footer?.text?.includes(`${MARKER} · ${key} · ${entry.digest}`))) {
          throw new Error(`VIP publication receipt for ${entry.name} is uncertain; inspect Discord before retrying.`);
        }
        entry = { ...entry, status: 'APPROVED', posted_message_id: found.id };
        state.experts[key] = entry;
        await writeState(state);
      }
      if (entry.digest !== item.digest || entry.status === 'CLOSED') {
        const oldPost = await managedVipMessage(destination, entry.posted_message_id, key);
        if (oldPost) await oldPost.delete();
        entry = { name: item.name, digest: item.digest, status: 'PENDING',
          review_message_id: entry.review_message_id || null, posted_message_id: null };
        state.experts[key] = entry;
        await writeState(state);
        changed = true;
      }
      const card = entry.review_message_id ? await review.messages.fetch(entry.review_message_id).catch(() => null) : null;
      if (card) {
        const expected = reviewPayload(item, entry.status);
        if (card.content !== expected.content || card.embeds?.[0]?.footer?.text !== expected.embeds[0].footer.text) {
          await card.edit(expected);
          changed = true;
        }
      } else {
        entry.status = 'REVIEW_SENDING';
        state.experts[key] = entry;
        await writeState(state);
        const posted = await review.send(reviewPayload(item, 'PENDING'));
        entry = { ...entry, status: 'PENDING', review_message_id: posted.id };
        state.experts[key] = entry;
        await writeState(state);
        changed = true;
      }
    }
    for (const [key, entry] of Object.entries(state.experts)) {
      if (items.has(key) || entry.status === 'CLOSED') continue;
      const oldPost = await managedVipMessage(destination, entry.posted_message_id, key);
      if (oldPost) await oldPost.delete();
      if (entry.review_message_id) {
        const card = await review.messages.fetch(entry.review_message_id).catch(() => null);
        if (card) await card.edit({ content: `**${entry.name}** no longer qualifies. This review is closed.`, embeds: [], components: [], allowedMentions: { parse: [] } });
      }
      state.experts[key] = { ...entry, status: 'CLOSED', posted_message_id: null };
      await writeState(state);
      changed = true;
    }
    if (state.legacy_review_message_id) {
      const oldCard = await review.messages.fetch(state.legacy_review_message_id).catch(() => null);
      if (oldCard) await oldCard.edit({ content: 'This full-list review was replaced by individual expert review cards below.', embeds: [], components: [], allowedMentions: { parse: [] } });
      state.legacy_review_message_id = null;
      await writeState(state);
      changed = true;
    }
    if (state.legacy_posted_message_id) {
      const oldPost = await managedVipMessage(destination, state.legacy_posted_message_id);
      if (oldPost) await oldPost.delete();
      state.legacy_posted_message_id = null;
      await writeState(state);
      changed = true;
    }
    return { status: changed ? 'REVIEW_UPDATED' : 'UNCHANGED', expertCount: items.size };
  }
  async function decideUnlocked({ customId, userId, ownerId, guildId, channelId, messageId }) {
    const match = String(customId).match(/^expert-pulse:(approve|reject|refresh):([a-z0-9]{1,60}):([a-f0-9]{20})$/);
    if (!match) throw new Error('This expert review card is outdated. Use the current individual cards.');
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can review this pulse.');
    const { source, review, destination } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id) throw new Error('Expert pulse action must come from the private review channel.');
    if (match[1] === 'refresh') return refreshUnlocked();
    const items = await candidate(source);
    const item = items.get(match[2]);
    if (!item || item.digest !== match[3]) {
      await refreshUnlocked();
      throw new Error('Expert data changed. Review the refreshed card before deciding.');
    }
    const state = await readState();
    const entry = state.experts?.[match[2]];
    if (!entry || entry.review_message_id !== messageId || entry.digest !== match[3] || entry.status !== 'PENDING') {
      throw new Error('This expert review is stale or already decided.');
    }
    if (match[1] === 'reject') {
      state.experts[match[2]] = { ...entry, status: 'REJECTED' };
      await writeState(state);
      const card = await review.messages.fetch(messageId);
      await card.edit(reviewPayload(item, 'REJECTED'));
      return { status: 'REJECTED', expert: item.name };
    }
    state.experts[match[2]] = { ...entry, status: 'PUBLISHING' };
    await writeState(state);
    const vipPayload = { ...item.payload, embeds: item.payload.embeds.map((embed, index) => index === 0
      ? { ...embed, title: `Expert Play Feedback · ${item.name}`, footer: { text: `${MARKER} · ${item.key} · ${item.digest}` } }
      : embed) };
    const existing = await managedVipMessage(destination, entry.posted_message_id, item.key);
    if (entry.posted_message_id && !existing) throw new Error('Previous VIP message is missing; publication held to avoid a duplicate.');
    const posted = existing ? await existing.edit(vipPayload) : await destination.send(vipPayload);
    state.experts[match[2]] = { ...entry, status: 'APPROVED', posted_message_id: posted.id };
    await writeState(state);
    const card = await review.messages.fetch(messageId);
    await card.edit(reviewPayload(item, 'APPROVED'));
    return { status: 'PUBLISHED', expert: item.name, messageId: posted.id };
  }
  return { refresh: () => locked(refreshUnlocked), decide: (args) => locked(() => decideUnlocked(args)) };
}

module.exports = { MARKER, createExpertPulse, payloadFor, selections, summary, verifiedRecords };
