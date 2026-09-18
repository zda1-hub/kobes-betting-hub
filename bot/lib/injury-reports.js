const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { auditedFetch } = require('../../pipeline/api-client');
const { pacificOperatingDate } = require('./pick-log');
const { PermissionFlagsBits } = require('discord.js');

const LEAGUES = Object.freeze({ nfl: 'football/nfl', mlb: 'baseball/mlb' });
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = value => String(value || '').replace(/[\r\n@*_`<>]/g, ' ').replace(/\s+/g, ' ').trim();

function injuryConfig(env = process.env) {
  const routes = String(env.INJURY_CHANNEL_MAP || '').split(',').filter(Boolean).map(item => {
    const [league, channelId] = item.trim().split(':');
    if (!LEAGUES[league] || !/^\d{17,20}$/.test(channelId || '')) throw new Error('Invalid injury route.');
    return { league, channelId };
  });
  if (new Set(routes.map(route => route.league)).size !== routes.length) throw new Error('Duplicate injury league route.');
  return { enabled: env.INJURY_REPORTS_ENABLED === 'true', routes };
}

function injuryCategory(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (['questionable', 'doubtful', 'day to day'].includes(normalized)) return 'uncertain';
  if (['out', 'inactive', 'injured reserve', 'ir', 'suspended', 'suspension'].includes(normalized)
      || /^(?:7|10|15|60) day (?:il|injured list)$/.test(normalized)) return 'unavailable';
  // Active/probable/unknown statuses must not be promoted into an injury alert.
  return null;
}

function questionableNote(entry) {
  const detail = clean(entry.details?.type);
  const injury = detail && detail !== 'Not Specified' ? `${detail} issue` : 'Injury details not specified';
  const dated = Number.isFinite(Date.parse(entry.date || '')) ? String(entry.date).slice(0, 10) : 'undated';
  // Source fields only: no model charge, inferred practice participation,
  // return-date promise, or unrelated performance commentary.
  return `${injury}; availability unconfirmed. Report: ${dated}.`;
}

function injuryPages(league, data, now = new Date()) {
  if (!LEAGUES[league] || !Array.isArray(data?.injuries)) throw new Error('Unexpected ESPN injury response.');
  const sourceTime = Date.parse(data.timestamp || '');
  if (!Number.isFinite(sourceTime) || now - sourceTime > 6 * 3600000 || sourceTime - now > 300000) {
    throw new Error('ESPN injury feed is stale or undated.');
  }
  const lines = [], seen = new Set();
  let count = 0, uncertainCount = 0, unavailableCount = 0;
  for (const team of [...data.injuries].sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))) {
    if (!Array.isArray(team.injuries)) throw new Error('Incomplete ESPN injury team response.');
    const entries = [], unavailable = [];
    for (const entry of team.injuries) {
      const name = clean(entry.athlete?.displayName), status = clean(entry.status);
      if (!name || !status) throw new Error('ESPN injury entry lacks player or status.');
      const category = injuryCategory(status);
      if (!category) continue;
      const key = `${team.id}:${entry.athlete?.id || name}`;
      if (seen.has(key)) continue;
      seen.add(key); count++;
      if (category === 'unavailable') {
        unavailableCount++;
        unavailable.push(`${name} (${status})`);
      } else {
        uncertainCount++;
        const position = clean(entry.athlete?.position?.abbreviation);
        const symbol = /^doubtful$/i.test(status) ? '🟠' : '🟡';
        entries.push(`${symbol} **${name}**${position ? ` (${position})` : ''} — **${status}**\n↳ ${questionableNote(entry)}`);
      }
    }
    if (entries.length || unavailable.length) {
      lines.push(`\n**${clean(team.displayName)}**`, ...entries);
      if (unavailable.length) {
        lines.push('🔴 **Out / unavailable**');
        // Compact list preserves every name and exact status, without summaries.
        let row = '';
        for (const player of unavailable) {
          if (row && row.length + player.length + 3 > 800) { lines.push(row); row = ''; }
          row += `${row ? ' · ' : ''}${player}`;
        }
        if (row) lines.push(row);
      }
    }
  }
  if (!count) lines.push('No questionable, doubtful, day-to-day or out/unavailable players were listed in this source snapshot. This does not confirm that every player is healthy or active.');
  const bodies = []; let body = '';
  for (const line of lines) {
    if (line.length > 900) throw new Error('Oversized ESPN injury entry.');
    if (body.length + line.length + 1 > 3300) { bodies.push(body); body = ''; }
    body += `${body ? '\n' : ''}${line}`;
  }
  if (body) bodies.push(body);
  const date = pacificOperatingDate(now), sourceUrl = `https://www.espn.com/${league}/injuries`;
  return { date, count, uncertainCount, unavailableCount, sourceTime: new Date(sourceTime).toISOString(), pages: bodies.map((description, index) => ({
    color: 0xFF7900,
    title: `${league.toUpperCase()} injury watch · ${date} · ${index + 1}/${bodies.length}`,
    description: `🟡 Questionable / day-to-day · 🟠 Doubtful · 🔴 Out / unavailable\nESPN-reported statuses, not confirmed game-day availability. Verify the latest team report.\n[Source: ESPN](${sourceUrl})\n\n${description}`,
    timestamp: new Date(sourceTime).toISOString(),
    footer: { text: `KBH injuries ${league} ${date} ${index + 1} · refreshes every 15 minutes` }
  })) };
}

async function save(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
}

// One writer and durable per-page receipts. Status changes edit the existing
// daily board. A lost send response is reconciled, never blindly re-posted.
function createInjuryDelivery({ root, routes, channelFor, fetchImpl = auditedFetch, now = () => new Date(), logger = console }) {
  let running = null, stopping = false;
  async function drain() {
    const receipts = [];
    for (const { league, channelId } of routes) {
      if (stopping) break;
      try {
        const response = await fetchImpl(`https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[league]}/injuries`,
          { signal: AbortSignal.timeout(15000) }, { callerComponent: 'bot/injury-reports', triggerType: 'cloud_injury_refresh' });
        if (!response.ok) throw new Error('ESPN injury source unavailable.');
        const report = injuryPages(league, await response.json(), now());
        if (report.date !== pacificOperatingDate(now())) throw new Error('Operating day changed.');
        const file = path.join(root, `${report.date}-${league}.json`);
        let state;
        try { state = JSON.parse(await fs.readFile(file, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; state = { channelId, pages: [] }; }
        if (state.channelId !== channelId) throw new Error('Injury destination changed; review old receipts first.');
        const channel = await channelFor(channelId);
        if (channel.permissionsFor && !channel.permissionsFor(channel.client.user)?.has([
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory
        ])) throw new Error('Required injury-channel permissions are missing.');
        for (let index = 0; index < Math.max(report.pages.length, state.pages.length); index++) {
          if (stopping || report.date !== pacificOperatingDate(now())) break;
          const marker = `KBH injuries ${league} ${report.date} ${index + 1}`;
          const embed = report.pages[index] || { color: 0xFF7900, title: `${league.toUpperCase()} injury watch · ${report.date}`,
            description: 'This page is no longer needed in the latest source snapshot. See the earlier pages for current entries.',
            footer: { text: `${marker} · superseded` }, timestamp: report.sourceTime };
          const fingerprint = hash(JSON.stringify({ ...embed, timestamp: undefined }));
          const previous = state.pages[index] || {};
          if (previous.reserved && !previous.messageId) {
            const recent = await channel.messages.fetch({ limit: 100 });
            const matches = [...recent.values()].filter(message => message.author.id === channel.client.user.id
              && message.embeds?.some(item => String(item.footer?.text || '').startsWith(`${marker} ·`)));
            if (matches.length !== 1) throw new Error('Uncertain injury send requires receipt review.');
            previous.messageId = matches[0].id;
            state.pages[index] = previous; await save(file, state);
          }
          if (previous.messageId && previous.fingerprint === fingerprint) continue;
          const payload = { embeds: [embed], allowedMentions: { parse: [] } };
          let message;
          if (previous.messageId) {
            message = await channel.messages.edit(previous.messageId, payload);
          } else {
            state.pages[index] = { reserved: true }; await save(file, state);
            try {
              message = await channel.send({ ...payload, nonce: hash(`${channelId}:${marker}`).slice(0, 24), enforceNonce: true });
            } catch (error) {
              // Definite Discord rejection is not an uncertain accepted send.
              // Retain its evidence but allow a later, repaired configuration.
              if ([400, 401, 403, 404].includes(error.status)) {
                state.pages[index] = { reserved: false, rejectedHttpStatus: error.status };
                await save(file, state);
              }
              throw error;
            }
          }
          if (!message?.id) throw new Error('Injury delivery receipt missing.');
          state.pages[index] = { messageId: message.id, fingerprint, reserved: false };
          state.sourceTime = report.sourceTime; state.checkedAt = now().toISOString();
          await save(file, state);
        }
        state.checkedAt = now().toISOString(); state.sourceTime = report.sourceTime;
        await save(file, state);
        receipts.push({ league, entries: report.count, pages: report.pages.length, channelId, sourceTime: report.sourceTime });
      } catch {
        logger.error(`Cloud ${league.toUpperCase()} injury refresh needs attention; stale or uncertain data was not re-posted.`);
        receipts.push({ league, status: 'NEEDS_ATTENTION' });
      }
    }
    return receipts;
  }
  return {
    run() { if (!running && !stopping) running = drain().finally(() => { running = null; }); return running || Promise.resolve([]); },
    async stop() { stopping = true; if (running) await running; }
  };
}

module.exports = { createInjuryDelivery, injuryConfig, injuryPages, injuryCategory, questionableNote };
