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

function payloadFor(report, records = []) {
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
  const format = ({ name, wins, losses, rate, references }) => `${name}: ${wins}-${losses} (${Math.round(rate * 100)}%)${references?.[0] ? ` · [latest post](${references[0]})` : ''}`;
  const ranked = (rows) => rows.sort((a, b) => b.rate - a.rate || b.wins - a.wins || a.name.localeCompare(b.name));
  const yesterday = ranked(records.map((expert) => ({ name: expert.name, references: expert.references, ...recordWithin(expert, end - day, end) }))
    .filter((item) => item.decisions && item.rate > 0.61));
  const sevenDays = ranked(records.map((expert) => ({ name: expert.name, references: expert.references, ...recordWithin(expert, end - 7 * day, end) }))
    .filter((item) => item.decisions && item.rate > 0.60));
  const allTime = ranked(records.map((expert) => ({ name: expert.name, wins: expert.wins, losses: expert.losses,
    rate: expert.wins + expert.losses ? expert.wins / (expert.wins + expert.losses) : 0, references: expert.references }))
    .filter((item) => item.wins + item.losses > 0 && item.rate > 0.54));
  const hot = records.map((expert) => {
    const byDate = new Map();
    for (const result of expert.results.filter((item) => ['W', 'L'].includes(item.grade))) {
      const date = operatingDate(result.at);
      const grades = byDate.get(date) || [];
      grades.push(result.grade);
      byDate.set(date, grades);
    }
    const dates = [...byDate.keys()].sort().reverse();
    let days = 0;
    for (const date of dates) {
      if (byDate.get(date).includes('L') || !byDate.get(date).includes('W')) break;
      days += 1;
    }
    const sports = [...new Set(expert.results.filter((item) => item.grade === 'W' && item.sport).map((item) => item.sport))];
    return { name: expert.name, days, label: sports.length === 1 ? sports[0] : 'all sports' };
  }).filter((item) => item.days >= 2).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  const lines = (items, mapper = format) => items.length ? items.map(mapper).join('\n') : 'No verified expert currently meets this threshold.';
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: 'Expert Play Feedback',
      description: `**Yesterday’s best · above 61%**\n${lines(yesterday)}\n\n**Hottest experts · 2+ winning days**\n${lines(hot, (item) => `${item.name}: ${item.days}-day verified streak (${item.label})`)}\n\n**Best exclusive records · last 7 days · above 60%**\n${lines(sevenDays)}\n\n**Best exclusive records · all time · above 54%**\n${lines(allTime)}\n\n**Today’s source activity (${report.date} Arizona)**\n${report.playCount} selections parsed from ${report.sourceCount} text-card sources.\n${active}\n\n**Exact-text repeats today**\n${repeated}\n\nVerified tracked results ${coverage}. Records count only linked, individually graded paid picks; pushes and voids are excluded from percentages. Image-only picks and unavailable history are not invented.`,
      footer: { text: `${MARKER} · Approved #expert-picks posts and verified pick log` }
    }]
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
    const payload = payloadFor(summary(messages, now()), verifiedRecords(rows, channels));
    const digest = createHash('sha256').update(`${payload.embeds[0].title}\n${payload.embeds[0].description}`).digest('hex').slice(0, 20);
    return { payload, digest };
  }
  function reviewPayload(payload, digest, status) {
    return {
      allowedMentions: { parse: [] },
      content: status === 'PENDING' ? 'Private review: verify the figures, then approve this exact snapshot for VIP.'
        : status === 'REJECTED' ? 'Rejected. Nothing was posted to VIP.' : 'Approved and posted to VIP.',
      embeds: [{ ...payload.embeds[0], title: 'Review Best Experts & Today’s Trends', footer: { text: `${REVIEW_MARKER} · ${digest}` } }],
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: 'Approve for VIP', custom_id: `expert-pulse:approve:${digest}`, disabled: status !== 'PENDING' },
        { type: 2, style: 4, label: 'Reject', custom_id: `expert-pulse:reject:${digest}`, disabled: status !== 'PENDING' },
        { type: 2, style: 2, label: 'Refresh', custom_id: `expert-pulse:refresh:${digest}` }
      ] }]
    };
  }
  async function refreshUnlocked() {
    const { source, review, destination } = await channels();
    const { payload, digest } = await candidate(source);
    const state = await readState();
    if (state.status === 'PUBLISHING') {
      const recent = await destination.messages.fetch({ limit: 100 });
      const matching = [...recent.values()].find((message) => message.embeds?.some((embed) =>
        embed.description === state.candidate_description && embed.footer?.text?.includes(MARKER)));
      if (!matching) throw new Error('Expert pulse VIP publication receipt is uncertain; inspect the destination before retrying.');
      await writeState({ ...state, status: 'PUBLISHED', posted_message_id: matching.id });
      const card = state.review_message_id ? await review.messages.fetch(state.review_message_id).catch(() => null) : null;
      if (card && digest === state.digest) await card.edit(reviewPayload(payload, digest, 'PUBLISHED'));
      return { status: 'PUBLICATION_RECOVERED', messageId: matching.id };
    }
    if (state.status === 'REVIEW_SENDING') {
      const recent = await review.messages.fetch({ limit: 100 });
      const matching = [...recent.values()].find((message) => message.embeds?.some((embed) =>
        embed.footer?.text?.includes(`${REVIEW_MARKER} · ${state.digest}`)));
      if (!matching) throw new Error('Expert pulse review-card receipt is uncertain; inspect the review channel before retrying.');
      await writeState({ ...state, status: 'PENDING', review_message_id: matching.id });
      return { status: 'REVIEW_RECOVERED', messageId: matching.id };
    }
    if (state.digest === digest && ['PENDING', 'REJECTED', 'PUBLISHED'].includes(state.status)) {
      const current = state.review_message_id ? await review.messages.fetch(state.review_message_id).catch(() => null) : null;
      if (current) return { status: 'UNCHANGED', messageId: current.id };
    }
    const next = { ...state, digest, status: 'PENDING', candidate_description: payload.embeds[0].description };
    const current = state.review_message_id ? await review.messages.fetch(state.review_message_id).catch(() => null) : null;
    if (current) {
      await writeState(next);
      await current.edit(reviewPayload(payload, digest, 'PENDING'));
      return { status: 'REVIEW_UPDATED', messageId: current.id };
    }
    await writeState({ ...next, status: 'REVIEW_SENDING' });
    const posted = await review.send(reviewPayload(payload, digest, 'PENDING'));
    await writeState({ ...next, review_message_id: posted.id });
    return { status: 'REVIEW_CREATED', messageId: posted.id };
  }
  async function decideUnlocked({ customId, userId, ownerId, guildId, channelId, messageId }) {
    const match = String(customId).match(/^expert-pulse:(approve|reject|refresh):([a-f0-9]{20})$/);
    if (!match) throw new Error('Unknown expert pulse action.');
    if (!isApprover({ userId, ownerId })) throw new Error('Only Kobe or a configured pick approver can review this pulse.');
    const { source, review, destination } = await channels();
    if (guildId !== source.guild.id || channelId !== review.id) throw new Error('Expert pulse action must come from the private review channel.');
    const state = await readState();
    if (messageId !== state.review_message_id) throw new Error('This is not the current expert pulse review card.');
    if (match[1] === 'refresh') return refreshUnlocked();
    if (state.digest !== match[2] || state.status !== 'PENDING') throw new Error('This review is stale or already decided.');
    const fresh = await candidate(source);
    if (fresh.digest !== state.digest) {
      await refreshUnlocked();
      throw new Error('Expert data changed. Review the refreshed card before approving.');
    }
    if (match[1] === 'reject') {
      await writeState({ ...state, status: 'REJECTED' });
      const card = await review.messages.fetch(messageId);
      await card.edit(reviewPayload(fresh.payload, state.digest, 'REJECTED'));
      return { status: 'REJECTED' };
    }
    await writeState({ ...state, status: 'PUBLISHING' });
    let existing = state.posted_message_id ? await destination.messages.fetch(state.posted_message_id).catch(() => null) : null;
    if (state.posted_message_id && !existing) throw new Error('Previous VIP message is missing or inaccessible; publication held to avoid a duplicate.');
    if (!existing) {
      // Recover the managed message even if an old ephemeral state file was
      // lost. Never create a second VIP pulse while one is still visible.
      const recent = await destination.messages.fetch({ limit: 100 });
      existing = [...recent.values()].find((message) => message.embeds?.some((embed) => embed.footer?.text?.includes(MARKER))) || null;
    }
    const posted = existing ? await existing.edit(fresh.payload) : await destination.send(fresh.payload);
    const complete = { ...state, status: 'PUBLISHED', posted_message_id: posted.id };
    await writeState(complete);
    const card = await review.messages.fetch(messageId);
    await card.edit(reviewPayload(fresh.payload, state.digest, 'PUBLISHED'));
    return { status: 'PUBLISHED', messageId: posted.id };
  }
  return { refresh: () => locked(refreshUnlocked), decide: (args) => locked(() => decideUnlocked(args)) };
}

module.exports = { MARKER, createExpertPulse, payloadFor, selections, summary, verifiedRecords };
