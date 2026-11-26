const inviteLabels = require('../../config/discord-invite-labels.json');

const apiOrigin = 'https://discord.com/api/v10';
const phoenixParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
function phoenixDay(date) { const p = phoenixParts(date); return `${p.year}-${p.month}-${p.day}`; }
function dueAtPhoenix1155(date) { const p = phoenixParts(date); return p.hour === '23' && Number(p.minute) >= 55; }

function usesMap(invites) {
  return new Map([...invites.values()].map(i => [i.code, Number(i.uses || 0)]).filter(([code]) => code));
}
function uniqueJoinCode(before, after) {
  if (!before) return null;
  const changed = [];
  for (const [code, uses] of after) {
    // A new invite cannot be attributed from an unknown baseline.
    if (!before.has(code)) continue;
    if (uses - before.get(code) === 1) changed.push(code);
    else if (uses > before.get(code)) return null;
  }
  return changed.length === 1 ? changed[0] : null;
}

function createDiscordGrowth({ guildId, discordToken, publisherUrl, publisherSecret, fetchImpl = fetch, logger = console, now = () => new Date() }) {
  const root = String(publisherUrl || '').replace(/\/$/, '');
  let invites = null;
  let joinQueue = Promise.resolve();
  let lastRunDate = null;
  let running = false;
  async function publisher(path, options = {}) {
    if (!root || !publisherSecret) throw new Error('Discord growth publisher URL/secret missing');
    const response = await fetchImpl(`${root}${path}`, {
      ...options, headers: { authorization: `Bearer ${publisherSecret}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Discord growth publisher ${path} returned ${response.status}`);
    return response.json();
  }
  async function discord(path) {
    if (!discordToken || !guildId) throw new Error('Discord token/guild ID missing');
    const response = await fetchImpl(`${apiOrigin}${path}`, {
      headers: { authorization: `Bot ${discordToken}` }, signal: AbortSignal.timeout(15000)
    });
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after') || 'unknown';
      throw new Error(`Discord rate limited ${path}; retry-after ${retryAfter}s; held until next scheduled run`);
    }
    if (!response.ok) throw new Error(`Discord ${path} returned ${response.status}`);
    return response.json();
  }
  async function tick({ at = now(), dryRun = false } = {}) {
    if (!dryRun && !dueAtPhoenix1155(at)) return { status: 'not_due' };
    const date = phoenixDay(at);
    if (!dryRun && (running || lastRunDate === date)) return { status: 'already_running_or_done' };
    running = true;
    try {
      if (!dryRun) {
        const check = await publisher(`/api/admin/discord-growth/snapshot?date=${date}`);
        if (check.exists) { lastRunDate = date; return { status: 'already_stored', date }; }
        // One attempt per local day, even after a 429 or other failure.
        lastRunDate = date;
      }
      // Exactly two Discord reads in the normal daily run. A 429 is logged, not retried.
      const guild = await discord(`/guilds/${guildId}?with_counts=true`);
      const inviteRows = await discord(`/guilds/${guildId}/invites`);
      if (!Number.isInteger(guild.approximate_member_count) || !Number.isInteger(guild.approximate_presence_count) || !Array.isArray(inviteRows))
        throw new Error('Discord growth response shape changed');
      const body = { date, taken_at: at.toISOString(), member_count: guild.approximate_member_count,
        presence_count: guild.approximate_presence_count,
        invites: inviteRows.map(row => ({ code: row.code, uses: Number(row.uses || 0),
          label: inviteLabels[row.code] || 'other', channel_label: String(row.channel?.name || 'unknown') })) };
      if (!dryRun) {
        await publisher('/api/admin/discord-growth/snapshot', { method: 'POST', body: JSON.stringify(body) });
        lastRunDate = date;
      }
      return { status: dryRun ? 'dry_run' : 'stored', ...body };
    } finally { running = false; }
  }
  async function initialize(guild) {
    try { invites = usesMap(await guild.invites.fetch()); return { status: 'ready', invite_count: invites.size }; }
    catch (error) { logger.warn(`Discord growth invite baseline unavailable: ${error.message}`); return { status: 'unattributed' }; }
  }
  function joined(member) {
    const task = joinQueue.then(async () => {
      let code = null;
      try {
        const current = usesMap(await member.guild.invites.fetch());
        code = uniqueJoinCode(invites, current);
        invites = current;
      } catch (error) { invites = null; logger.warn(`Discord growth join invite read failed: ${error.message}`); }
      const joinedAt = member.joinedAt instanceof Date ? member.joinedAt.toISOString() : now().toISOString();
      await publisher('/api/admin/discord-growth/event', { method: 'POST', body: JSON.stringify({
        type: 'join', user_id: member.id, at: joinedAt, invite_code: code
      }) });
      return { status: 'stored', invite_code: code };
    });
    joinQueue = task.catch(() => {});
    return task;
  }
  async function left(member) {
    await joinQueue;
    return publisher('/api/admin/discord-growth/event', { method: 'POST', body: JSON.stringify({
      type: 'leave', user_id: member.id, at: now().toISOString(), invite_code: null
    }) });
  }
  async function gainedPaidRole(member) {
    await joinQueue;
    return publisher('/api/admin/discord-growth/event', { method: 'POST', body: JSON.stringify({
      type: 'paid_role', user_id: member.id, at: now().toISOString(), invite_code: null
    }) });
  }
  return { tick, initialize, joined, left, gainedPaidRole };
}
module.exports = { createDiscordGrowth, phoenixDay, dueAtPhoenix1155, uniqueJoinCode };
