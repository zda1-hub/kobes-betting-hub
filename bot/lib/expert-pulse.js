const fs = require('node:fs/promises');
const path = require('node:path');
const { expertName } = require('./vip-expert-list');

const MARKER = 'KBH expert-pulse-v1';
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
  const graded = records.length
    ? records.slice(0, 5).map((row) => `${row.name}: ${row.wins}-${row.losses}-${row.pushes}P-${row.voids}V${row.streak >= 2 ? ` · ${row.streak} straight settled wins` : ''} · [latest post](${row.references[0]})`).join('\n')
    : 'No linked, individually graded paid expert results on record. Records and streaks are withheld until verified.';
  const sports = new Map();
  for (const expert of records) {
    for (const result of expert.results) {
      if (!result.sport || !['W', 'L'].includes(result.grade)) continue;
      const key = `${result.sport}:${keyFor(expert.name)}`;
      const row = sports.get(key) || { sport: result.sport, name: expert.name, wins: 0, losses: 0 };
      if (result.grade === 'W') row.wins += 1;
      else row.losses += 1;
      sports.set(key, row);
    }
  }
  const leaders = [...sports.values()].filter((row) => row.wins + row.losses >= 3)
    .sort((a, b) => a.sport.localeCompare(b.sport) || b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses) || b.wins - a.wins);
  const bySport = [...new Set(leaders.map((row) => row.sport))].slice(0, 4)
    .map((sport) => { const row = leaders.find((item) => item.sport === sport); return `${sport}: ${row.name} ${row.wins}-${row.losses} (minimum 3 graded)`; }).join('\n')
    || 'No sport has an expert with at least 3 linked, graded decisions on record.';
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: 'VIP Expert Picks Pulse',
      description: `**Today (${report.date} Arizona):** ${report.playCount} posted selections from ${report.sourceCount} sources across #expert-picks messages.\n\n**Most posted sources today**\n${active}\n\n**Repeated selections today (not wager volume)**\n${repeated}\n\n**Tracked verified paid expert records · ${coverage}**\n${graded}\n\n**Verified leaders by sport · tracked history**\n${bySport}\n\nPosting frequency is not a win rate. Records count only linked, individually graded wagers; pushes and voids are separate. Historical coverage may be incomplete.`,
      footer: { text: `${MARKER} · Approved #expert-picks posts and verified pick log` }
    }]
  };
}

async function createExpertPulse({ sourceChannelFor, destinationChannelFor, rowsFor = async () => [], paidChannelIds = [], stateFile, now = () => Date.now() }) {
  const [source, destination] = await Promise.all([sourceChannelFor(), destinationChannelFor()]);
  if (source.id === destination.id) throw new Error('Expert pulse destination must be separate from #expert-picks.');
  if (!source.guild?.id || source.guild.id !== destination.guild?.id) {
    throw new Error('Expert pulse source and destination must be in the same Discord server.');
  }
  const guild = destination.guild;
  if (!guild || destination.permissionsFor(guild.roles.everyone)?.has('ViewChannel') !== false) {
    throw new Error('Expert pulse destination privacy could not be verified; refusing to publish VIP selections.');
  }
  let state = {};
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const existing = await destination.messages.fetch({ limit: 100 });
  const managed = [...existing.values()].find((message) => message.embeds?.some((embed) => embed.footer?.text?.includes(MARKER)));
  const messages = [];
  let before;
  for (let page = 0; page < 20; page += 1) {
    const batch = await source.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    messages.push(...batch.values());
    if (batch.size < 100 || [...batch.values()].every((message) => operatingDate(message.createdTimestamp || 0) !== operatingDate(now()))) break;
    before = batch.last().id;
  }
  const rows = await rowsFor();
  const payload = payloadFor(summary(messages, now()), verifiedRecords(rows, paidChannelIds));
  const signature = JSON.stringify(payload.embeds[0].description);
  const current = managed || (state.message_id ? await destination.messages.fetch(state.message_id).catch(() => null) : null);
  if (current && state.signature === signature) return { status: 'UNCHANGED', messageId: current.id };
  const posted = current ? await current.edit(payload) : await destination.send(payload);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify({ message_id: posted.id, signature }, null, 2)}\n`);
  return { status: current ? 'UPDATED' : 'CREATED', messageId: posted.id };
}

module.exports = { MARKER, createExpertPulse, payloadFor, selections, summary, verifiedRecords };
