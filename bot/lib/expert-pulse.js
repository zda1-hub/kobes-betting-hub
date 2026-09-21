const fs = require('node:fs/promises');
const path = require('node:path');
const { expertName } = require('./vip-expert-list');

const MARKER = 'KBH expert-pulse-v1';
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function selections(message) {
  if (!expertName(message)) return [];
  const text = [message.content, ...(message.embeds || []).map((embed) => embed.description || '')].filter(Boolean).join('\n');
  return text.split(/\r?\n/).slice(1)
    .map((line) => line.match(/^\s*[-•*]\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((line) => line && line.length >= 8 && line.length <= 180 && !/https?:\/\/|@everyone|@here/i.test(line));
}

function summary(messages, now = Date.now()) {
  const recent = messages.filter((message) => {
    const at = message.createdTimestamp ?? new Date(message.createdAt).getTime();
    return Number.isFinite(at) && at >= now - WINDOW_MS && at <= now;
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
    playCount,
    sourceCount: sources.size,
    active: [...sources.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    repeated: [...repeated.values()].filter((row) => row.count > 1).sort((a, b) => b.count - a.count || a.play.localeCompare(b.play)).slice(0, 5)
  };
}

function payloadFor(report) {
  const active = report.active.length
    ? report.active.map((row) => `${row.name}: ${row.count} posted selection${row.count === 1 ? '' : 's'}`).join('\n')
    : 'No qualifying expert posts in the last 7 days.';
  const repeated = report.repeated.length
    ? report.repeated.map((row) => `${row.count} posts - ${row.play}`).join('\n')
    : 'No identical selections repeated in the last 7 days.';
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      color: 0xFF7900,
      title: 'VIP Expert Picks Pulse',
      description: `**Last 7 days:** ${report.playCount} posted selections from ${report.sourceCount} sources.\n\n**Most active sources**\n${active}\n\n**Repeated selections**\n${repeated}\n\n**Hot streaks:** Not shown until completed results are graded and linked to each expert. A post count is not a win rate.`,
      footer: { text: `${MARKER} · Source: approved #expert-picks posts · 7-day rolling window` }
    }]
  };
}

async function createExpertPulse({ sourceChannelFor, destinationChannelFor, stateFile, now = () => Date.now() }) {
  const [source, destination] = await Promise.all([sourceChannelFor(), destinationChannelFor()]);
  if (source.id === destination.id) throw new Error('Expert pulse destination must be separate from #expert-picks.');
  const guild = destination.guild;
  if (guild && destination.permissionsFor(guild.roles.everyone)?.has('ViewChannel')) {
    throw new Error('Expert pulse destination is public; refusing to publish VIP selections.');
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
    if (batch.size < 100 || [...batch.values()].every((message) => (message.createdTimestamp || 0) < now() - WINDOW_MS)) break;
    before = batch.last().id;
  }
  const payload = payloadFor(summary(messages, now()));
  const signature = JSON.stringify(payload.embeds[0].description);
  const current = managed || (state.message_id ? await destination.messages.fetch(state.message_id).catch(() => null) : null);
  if (current && state.signature === signature) return { status: 'UNCHANGED', messageId: current.id };
  const posted = current ? await current.edit(payload) : await destination.send(payload);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify({ message_id: posted.id, signature }, null, 2)}\n`);
  return { status: current ? 'UPDATED' : 'CREATED', messageId: posted.id };
}

module.exports = { MARKER, createExpertPulse, payloadFor, selections, summary };
