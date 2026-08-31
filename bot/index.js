require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { buildPickEmbed, listFromEnv } = require('./lib/pick');
const { buildLogRecapEmbeds } = require('./lib/recap');
const { appendOfficialPick, makePickId, netUnitsFor, pacificOperatingDate, readPickLog, updateOfficialPick } = require('./lib/pick-log');
const { WELCOME_BUTTON_ID, buildWelcomeInvite, buildWelcomeDm } = require('./lib/welcome');
const { assertFreePickEligible, assertPublishableExtraction, buildSourcePickEmbed, sourceCapperName } = require('./lib/source-review');
const { syncApprovedFreePickToX } = require('./lib/free-pick-x');
const { reviewQueuePath } = require('./lib/review-queue-path');
const { isRecentSourcePost, upcomingEventStatus } = require('./lib/event-timing');
const { alreadyPublishedTrend, generateTrendReport, markTrendPublished, reportEmbeds, saveTrendReport } = require('./lib/espn-trends');
const { enrichPacket } = require('../pipeline/enrich-pick');
const { runCollector } = require('../pipeline/collect-x');

const required = ['DISCORD_TOKEN'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
}

const publisherRoleIds = listFromEnv(process.env.PUBLISHER_ROLE_IDS);
const allowedChannelIds = listFromEnv(process.env.ALLOWED_CHANNEL_IDS);
const defaultChannelId = process.env.PUBLISH_CHANNEL_ID;
const recapChannelId = process.env.RECAP_CHANNEL_ID || defaultChannelId;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const welcomeRoleId = process.env.WELCOME_ROLE_ID;
const freePickChannelId = process.env.FREE_PICK_CHANNEL_ID;
// The approved #exclusives destination is kept configurable for future moves.
// The fallback preserves the currently approved server destination when an
// older Render environment has not yet added the variable.
const exclusivesChannelId = process.env.EXCLUSIVES_CHANNEL_ID || '1539055850075852911';
const pickApprovalChannelId = process.env.PICK_APPROVAL_CHANNEL_ID;
const sourcesPath = path.join(__dirname, '..', 'data', 'twitter-sources.json');
const trendsChannelMap = new Map(
  (process.env.TRENDS_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([league, channelId]) => league && channelId)
    .map(([league, channelId]) => [league.toLowerCase(), channelId])
);
const pickApproverUserIds = listFromEnv(process.env.PICK_APPROVER_USER_IDS);
const reviewQueueRoot = reviewQueuePath();
const sportChannelMap = new Map(
  (process.env.SPORT_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([sport, channelId]) => sport && channelId)
    .map(([sport, channelId]) => [sport.toLowerCase(), channelId])
);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const welcomedMemberIds = new Set();
let xCollectionInProgress = false;
let xMonitorCreated = 0;
let xMonitorIntervalTimer = null;
let xMonitorStopTimer = null;
let xMonitorDailyTimer = null;
let trendsTimer = null;
let trendsPublicationInProgress = false;

function xMonitorIntervalMs() {
  const configured = Number(process.env.X_MONITOR_INTERVAL_MS || 300000);
  // Guard against an accidental rapid polling setting that could create an
  // unnecessary X API bill. Five minutes is the default; one minute is the floor.
  if (!Number.isFinite(configured) || configured < 60000) return 300000;
  return configured;
}

function pacificClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function trendsDailyTime() {
  const value = (process.env.TRENDS_DAILY_AT || '11:00').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    console.warn('Ignoring invalid TRENDS_DAILY_AT. Use HH:MM in California time, for example 11:00.');
    return null;
  }
  return value;
}

async function publishScheduledTrends() {
  if (trendsPublicationInProgress || process.env.TRENDS_AUTO_PUBLISH_ENABLED !== 'true') return;
  const scheduledTime = trendsDailyTime();
  const now = pacificClock();
  if (!scheduledTime || now.time !== scheduledTime) return;

  trendsPublicationInProgress = true;
  try {
    for (const league of ['mlb', 'nfl']) {
      if (!trendsChannelMap.has(league)) {
        console.warn(`Skipping ${league.toUpperCase()} trends: no approved destination in TRENDS_CHANNEL_MAP.`);
        continue;
      }
      if (await alreadyPublishedTrend({ league, date: now.date })) continue;
      const report = await generateTrendReport({ league, date: now.date });
      if (report.matchups.length === 0) {
        console.log(`Skipping ${report.league} trends for ${now.date}: ESPN has no listed games.`);
        continue;
      }
      await saveTrendReport(report);
      const channel = await approvedTextChannel(trendsChannelMap.get(league));
      const messages = [];
      for (const embed of reportEmbeds(report)) messages.push(await channel.send({ embeds: [embed] }));
      await markTrendPublished({ league, date: now.date, channelId: channel.id, messageIds: messages.map((message) => message.id) });
      console.log(`Published scheduled ${report.league} trends for ${now.date} to #${channel.name || channel.id}.`);
    }
  } catch (error) {
    console.error('Scheduled trends publication failed:', error);
  } finally {
    trendsPublicationInProgress = false;
  }
}

function startTrendsSchedule() {
  if (process.env.TRENDS_AUTO_PUBLISH_ENABLED !== 'true') {
    console.log('Automatic trends publication is disabled. Set TRENDS_AUTO_PUBLISH_ENABLED=true to enable it.');
    return;
  }
  if (!trendsDailyTime()) return;
  // Check on the minute. The schedule intentionally does not backfill after a
  // restart, so it cannot post a stale in-progress-game sheet later in the day.
  trendsTimer = setInterval(() => void publishScheduledTrends(), 30000);
  void publishScheduledTrends();
  console.log(`Automatic ESPN trends are scheduled for ${trendsDailyTime()} California time.`);
}

function xMonitorStartAtMs() {
  const raw = process.env.X_MONITOR_START_AT?.trim();
  if (!raw) return null;

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    console.warn('Ignoring invalid X_MONITOR_START_AT. Use an ISO time with timezone, for example 2026-08-27T07:00:00-07:00.');
    return null;
  }

  return timestamp;
}

function xMonitorStopAtMs() {
  const raw = process.env.X_MONITOR_STOP_AT?.trim();
  if (!raw) return null;

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    console.warn('Ignoring invalid X_MONITOR_STOP_AT. Use an ISO time with timezone, for example 2026-08-27T18:00:00-07:00.');
    return null;
  }

  return timestamp;
}

function xMonitorDailyAt() {
  const raw = process.env.X_MONITOR_DAILY_AT?.trim();
  if (!raw) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    console.warn('Ignoring invalid X_MONITOR_DAILY_AT. Use HH:MM in Arizona time, for example 11:00.');
    return null;
  }
  return raw;
}

function xMonitorDailyStopAt() {
  const raw = process.env.X_MONITOR_DAILY_STOP_AT?.trim();
  if (!raw) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    console.warn('Ignoring invalid X_MONITOR_DAILY_STOP_AT. Use HH:MM in Arizona time, for example 15:00.');
    return null;
  }
  return raw;
}

function arizonaDailyTimestampMs(time, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T${time}:00-07:00`).getTime();
}

function nextArizonaDailyStartMs(time, now = new Date()) {
  const today = new Date(arizonaDailyTimestampMs(time, now));
  return now < today ? today.getTime() : today.getTime() + 24 * 60 * 60 * 1000;
}

function xMonitorCandidateLimit() {
  const raw = process.env.X_MONITOR_MAX_CANDIDATES?.trim();
  if (!raw) return null;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    console.warn('Ignoring invalid X_MONITOR_MAX_CANDIDATES. Use a whole number of at least 1.');
    return null;
  }
  return limit;
}

function dailyFreePickLimit() {
  const raw = (process.env.MAX_DAILY_FREE_PICKS || process.env.X_MONITOR_MAX_APPROVED_FREE_PICKS || '').trim();
  if (!raw) return null;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    console.warn('Ignoring the daily free-pick limit. Use a whole number of at least 1.');
    return null;
  }
  return limit;
}

async function publishedFreePickCount() {
  if (!freePickChannelId) return 0;
  const rows = await readPickLog();
  return rows.filter((row) => (
    row.operating_date === pacificOperatingDate()
    && row.status === 'PUBLISHED'
    && row.destination === '#daily-free-play'
  )).length;
}

async function enforceDailyFreePickLimit() {
  const limit = dailyFreePickLimit();
  if (limit === null) return;
  const published = await publishedFreePickCount();
  if (published >= limit) {
    throw new Error(`The daily free-pick limit of ${limit} has already been reached. No additional free pick was published.`);
  }
}

async function pendingSourceReviewCount() {
  const today = pacificOperatingDate();
  const directory = path.join(reviewQueueRoot, today);
  try {
    const files = await fs.readdir(directory);
    let pending = 0;
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const packet = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
      if (!packet.approval?.decision) pending += 1;
    }
    return pending;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

function stopXMonitor(reason) {
  if (xMonitorIntervalTimer) {
    clearInterval(xMonitorIntervalTimer);
    xMonitorIntervalTimer = null;
  }
  if (xMonitorStopTimer) {
    clearTimeout(xMonitorStopTimer);
    xMonitorStopTimer = null;
  }
  console.log(`X monitoring stopped: ${reason}`);
  const dailyAt = xMonitorDailyAt();
  if (dailyAt && process.env.X_MONITOR_ENABLED === 'true' && !xMonitorDailyTimer) {
    const nextStart = nextArizonaDailyStartMs(dailyAt);
    xMonitorDailyTimer = setTimeout(() => {
      xMonitorDailyTimer = null;
      void beginDailyXMonitor();
    }, Math.max(0, nextStart - Date.now()));
    console.log(`X monitoring will resume at ${new Date(nextStart).toISOString()} for the next daily window.`);
  }
}

async function beginDailyXMonitor() {
  const dailyAt = xMonitorDailyAt();
  if (!dailyAt || process.env.X_MONITOR_ENABLED !== 'true') return;
  const firstStartAt = xMonitorStartAtMs();
  if (firstStartAt !== null && Date.now() < firstStartAt) {
    xMonitorDailyTimer = setTimeout(() => {
      xMonitorDailyTimer = null;
      void beginDailyXMonitor();
    }, firstStartAt - Date.now());
    console.log(`X monitoring is scheduled to begin at ${new Date(firstStartAt).toISOString()} before entering the daily 11:00 AM Arizona schedule.`);
    return;
  }
  const startAt = nextArizonaDailyStartMs(dailyAt);
  const now = new Date();
  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const currentTime = `${todayParts.find((part) => part.type === 'hour').value}:${todayParts.find((part) => part.type === 'minute').value}`;
  const startToday = startAt - 24 * 60 * 60 * 1000;
  if (currentTime < dailyAt) {
    xMonitorDailyTimer = setTimeout(() => {
      xMonitorDailyTimer = null;
      void beginDailyXMonitor();
    }, startToday - now.getTime());
    console.log(`X monitoring is scheduled to begin at ${new Date(startToday).toISOString()} (11:00 AM Arizona time).`);
    return;
  }
  const limit = dailyFreePickLimit();
  const dailyStopAt = xMonitorDailyStopAt();
  if (dailyStopAt && currentTime >= dailyStopAt) {
    stopXMonitor(`today's daily cutoff of ${dailyStopAt} Arizona time has passed`);
    return;
  }
  if (limit !== null && await publishedFreePickCount() >= limit) {
    stopXMonitor(`today's ${limit}-pick limit is already reached`);
    return;
  }
  const interval = xMonitorIntervalMs();
  console.log(`X monitoring enabled at ${currentTime} Arizona time: checking every ${Math.round(interval / 60000)} minute(s) until ${limit ?? 'the configured'} daily free-pick limit is reached.`);
  void collectXSafely();
  xMonitorIntervalTimer = setInterval(() => void collectXSafely(), interval);
  if (dailyStopAt) {
    const stopAtMs = arizonaDailyTimestampMs(dailyStopAt);
    xMonitorStopTimer = setTimeout(() => stopXMonitor(`daily cutoff of ${dailyStopAt} Arizona time reached`), Math.max(0, stopAtMs - Date.now()));
    console.log(`X monitoring is scheduled to stop at ${new Date(stopAtMs).toISOString()} each day if two picks have not been published.`);
  }
}

async function collectXSafely() {
  if (xCollectionInProgress) {
    console.log('X collection is already running; skipped overlapping interval.');
    return;
  }

  xCollectionInProgress = true;
  try {
    const approvedFreePickLimit = dailyFreePickLimit();
    if (approvedFreePickLimit !== null) {
      const published = await publishedFreePickCount();
      if (published >= approvedFreePickLimit) {
        stopXMonitor(`published ${published} approved free pick(s); limit was ${approvedFreePickLimit}`);
        return;
      }

      const pending = await pendingSourceReviewCount();
      const pendingCapacity = Math.max(0, approvedFreePickLimit - published - pending);
      if (pendingCapacity === 0) {
        console.log(`X monitoring is waiting for Kobe's decision on ${pending} private approval card(s).`);
        return;
      }

      // Keep enough undecided drafts in front of Kobe to fill the remaining
      // free-pick capacity, while never exceeding the daily published limit.
      await runCollector({ maxCandidates: pendingCapacity });
      return;
    }

    const limit = xMonitorCandidateLimit();
    const remaining = limit === null ? undefined : limit - xMonitorCreated;
    if (remaining !== undefined && remaining <= 0) {
      stopXMonitor(`candidate limit of ${limit} already reached`);
      return;
    }
    const result = await runCollector({ maxCandidates: remaining });
    xMonitorCreated += result.created;
    if (limit !== null && xMonitorCreated >= limit) {
      stopXMonitor(`created ${xMonitorCreated} private approval card(s); limit was ${limit}`);
    }
  } catch (error) {
    console.error(`X collection failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    xCollectionInProgress = false;
  }
}

function startXMonitor() {
  if (process.env.X_MONITOR_ENABLED !== 'true') {
    console.log('X monitoring is disabled. Set X_MONITOR_ENABLED=true only when Kobe authorizes the launch.');
    return;
  }

  if (xMonitorDailyAt()) {
    void beginDailyXMonitor();
    return;
  }

  const beginMonitoring = () => {
    const stopAtMs = xMonitorStopAtMs();
    if (stopAtMs !== null && stopAtMs <= Date.now()) {
      stopXMonitor(`scheduled stop time ${new Date(stopAtMs).toISOString()} has already passed`);
      return;
    }
    const interval = xMonitorIntervalMs();
    const approvedFreePickLimit = dailyFreePickLimit();
    const limit = xMonitorCandidateLimit();
    xMonitorCreated = 0;
    const stoppingRule = approvedFreePickLimit !== null
      ? ` until ${approvedFreePickLimit} Kobe-approved free pick(s) are published`
      : (limit === null ? '' : ` until ${limit} private approval card(s) are created`);
    console.log(`X monitoring enabled: checking approved sources every ${Math.round(interval / 60000)} minute(s)${stoppingRule}.`);
    void collectXSafely();
    xMonitorIntervalTimer = setInterval(() => void collectXSafely(), interval);
    if (stopAtMs !== null) {
      console.log(`X monitoring is scheduled to stop at ${new Date(stopAtMs).toISOString()}.`);
      xMonitorStopTimer = setTimeout(() => {
        stopXMonitor(`scheduled stop time ${new Date(stopAtMs).toISOString()} reached`);
      }, stopAtMs - Date.now());
    }
  };

  const startAtMs = xMonitorStartAtMs();
  const delayMs = startAtMs === null ? 0 : startAtMs - Date.now();
  if (delayMs <= 0) {
    beginMonitoring();
    return;
  }

  console.log(`X monitoring is scheduled to begin at ${new Date(startAtMs).toISOString()}.`);
  setTimeout(beginMonitoring, delayMs);
}

function isPublisher(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (publisherRoleIds.size === 0) return false;
  return interaction.member.roles.cache.some((role) => publisherRoleIds.has(role.id));
}

function isAdministrator(interaction) {
  return interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function isPickApprover(interaction) {
  if (!interaction.inGuild()) return false;
  return interaction.guild.ownerId === interaction.user.id || pickApproverUserIds.has(interaction.user.id);
}

async function approvedTextChannel(channelId) {
  if (!channelId) throw new Error('No destination is configured for this approval action.');
  if (!allowedChannelIds.has(channelId)) throw new Error('That destination is not allowlisted.');
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Configured destination is not a text channel.');
  return channel;
}

function normalizedSport(packet) {
  const sourceSport = `${packet.analysis?.extraction?.sport || ''} ${packet.analysis?.extraction?.league || ''}`.toLowerCase();
  if (/baseball|mlb/.test(sourceSport)) return 'baseball';
  if (/football|nfl|ncaaf/.test(sourceSport)) return 'football';
  if (/basketball|nba|wnba|ncaab/.test(sourceSport)) return 'basketball';
  if (/hockey|nhl/.test(sourceSport)) return 'hockey';
  if (/soccer|fifa|mls/.test(sourceSport)) return 'soccer';
  return null;
}

function discordPostReference(channel, message) {
  const guildId = message.guildId || channel.guildId;
  return guildId ? `https://discord.com/channels/${guildId}/${channel.id}/${message.id}` : '';
}

function firstExtractedUnits(packet) {
  const extraction = packet.analysis?.extraction || {};
  const firstPlay = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays[0] : extraction;
  return firstPlay?.units || extraction.units || '';
}

async function postAndLogOfficialPick({ channel, payload, entry }) {
  await appendOfficialPick(entry);
  try {
    const message = await channel.send(payload);
    await updateOfficialPick(entry.pick_id, {
      post_reference: discordPostReference(channel, message),
      status: 'PUBLISHED'
    });
    return message;
  } catch (error) {
    await updateOfficialPick(entry.pick_id, {
      status: 'POST_FAILED',
      notes: `Discord post failed: ${error instanceof Error ? error.message : String(error)}`
    });
    throw error;
  }
}

function sourceCardIdentity(message) {
  const embed = message?.embeds?.[0];
  const cardText = [
    embed?.title,
    embed?.description,
    ...(embed?.fields || []).flatMap((field) => [field.name, field.value])
  ].filter(Boolean).join('\n');
  const postUrl = cardText.match(/https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/i);
  const handle = cardText.match(/\*\*Source:\*\*\s*@([A-Za-z0-9_]+)/i)?.[1]
    || cardText.match(/\*\*Posted by:\*\*[^\n]*\(@?([A-Za-z0-9_]+)\)/i)?.[1]
    || cardText.match(/@([A-Za-z0-9_]+)/)?.[1]
    || postUrl?.[1]
    || '';
  if (!handle || !postUrl) return null;
  return { handle, postId: postUrl[2], postUrl: postUrl[0] };
}

async function hydrateLegacyReviewPacket({ interaction, pickId }) {
  // Old bot cards can remain visible after an earlier non-persistent run. Only
  // recover a card authored by this bot in the configured private review room.
  if (!pickApprovalChannelId || interaction.channelId !== pickApprovalChannelId) return null;
  if (interaction.message?.author?.id !== client.user?.id) return null;
  const identity = sourceCardIdentity(interaction.message);
  if (!identity || !process.env.X_BEARER_TOKEN) return null;

  let sources;
  try {
    sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
  } catch (error) {
    console.error('Unable to read configured X sources while recovering an approval card:', error);
    return null;
  }
  const sourceConfig = sources.find((source) => source.handle?.toLowerCase() === identity.handle.toLowerCase());
  if (!sourceConfig) return null;

  const response = await fetch(`https://api.x.com/2/tweets/${identity.postId}?tweet.fields=created_at,attachments,entities&expansions=attachments.media_keys&media.fields=url,preview_image_url,type`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
  });
  if (!response.ok) {
    console.error(`Could not recover X approval card ${pickId}: X returned ${response.status}.`);
    return null;
  }
  const result = await response.json();
  const post = result.data;
  if (!post?.id) return null;
  const mediaByKey = Object.fromEntries((result.includes?.media || []).map((media) => [media.media_key, media.url || media.preview_image_url]));
  const date = /^\d{8}/.test(pickId)
    ? `${pickId.slice(0, 4)}-${pickId.slice(4, 6)}-${pickId.slice(6, 8)}`
    : pacificOperatingDate();
  const approvalNumber = Number(pickId.match(/^\d{8}-(\d+)-X$/)?.[1]) || 0;
  const packet = {
    pick_id: pickId,
    approval_number: approvalNumber,
    status: 'NEEDS_INFO',
    approval_ready: false,
    source: {
      platform: 'Twitter/X',
      handle: sourceConfig.handle,
      display_name: sourceConfig.display_name,
      monitoring_mode: sourceConfig.monitoring_mode || 'standard',
      post_id: post.id,
      post_url: identity.postUrl,
      posted_at: post.created_at,
      credit_line: sourceConfig.credit_line,
      reuse_permission: sourceConfig.reuse_permission,
      publish_mode: sourceConfig.publish_mode || 'writeup_review',
      text: post.text || '',
      media_urls: (post.attachments?.media_keys || []).map((key) => mediaByKey[key]).filter(Boolean)
    },
    approval: { approver: 'Kobe', decision: null, destination_sport: null, image_url: null, exact_final_copy: null, decided_at: null },
    analysis: { status: 'NOT_STARTED', detail: 'Recovering the source post for this older approval card.', extracted_at: null, model: null, source_only: true, extraction: null, draft_status: 'WAITING_FOR_INDEPENDENT_VERIFICATION' },
    created_at: new Date().toISOString(),
    recovered_from_discord_message_id: interaction.message.id
  };
  packet.analysis = await enrichPacket(packet);
  const directory = path.join(reviewQueueRoot, date);
  const packetPath = path.join(directory, `${pickId.replace(/-X$/, '')}.json`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`Recovered legacy approval card ${pickId} from its original X post.`);
  return { packet, packetPath };
}

async function findReviewPacket(pickId, interaction) {
  if (!/^[A-Za-z0-9_-]+$/.test(pickId)) return null;
  let dates;
  try {
    dates = await fs.readdir(reviewQueueRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return hydrateLegacyReviewPacket({ interaction, pickId });
    throw error;
  }
  for (const date of dates.filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    const directory = path.join(reviewQueueRoot, date.name);
    const files = await fs.readdir(directory);
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const packetPath = path.join(directory, file);
      const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'));
      if (packet.pick_id === pickId) return { packet, packetPath };
    }
  }
  return hydrateLegacyReviewPacket({ interaction, pickId });
}

async function handleSourceReviewButton(interaction) {
  const [, pickId, action] = interaction.customId.split(':');
  await interaction.deferReply({ ephemeral: true });
  if (!isPickApprover(interaction)) {
    await interaction.editReply('Only Kobe can approve, route, or reject this source draft.');
    return;
  }
  if (!['free', 'paid', 'reject'].includes(action)) {
    await interaction.editReply('This review action is not recognized.');
    return;
  }
  const found = await findReviewPacket(pickId, interaction);
  if (!found) {
    await interaction.editReply('The review packet is no longer available. Do not publish it; create a fresh draft.');
    return;
  }
  const { packet, packetPath } = found;
  if (packet.approval?.decision) {
    await interaction.editReply(`This draft was already marked ${packet.approval.decision.toLowerCase()}.`);
    return;
  }
  if (packet.test_only && action !== 'reject') {
    await interaction.editReply('This is a safety test card. Only Reject is enabled; no member-facing post can be made from it.');
    return;
  }

  const approval = packet.approval || {};
  approval.approver = interaction.user.id;
  approval.decided_at = new Date().toISOString();
  if (action === 'reject') {
    approval.decision = 'REJECTED';
    packet.status = 'REJECTED';
    packet.approval = approval;
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await interaction.message.edit({ components: [] });
    await interaction.editReply('Rejected. No member-facing post was made.');
    return;
  }

  try {
    const termsOnly = packet.source?.publish_mode === 'terms_only';
    const sourcePostingEnabled = process.env.X_SOURCE_PUBLISHING_ENABLED === 'true';
    if (packet.source?.reuse_permission !== 'CONFIRMED' && !termsOnly && !sourcePostingEnabled) {
      throw new Error('This source is approved for monitoring only. Use Kobe’s original wording and approved media with /publish-pick until source reuse permission is confirmed.');
    }
    assertPublishableExtraction(packet);
    const timing = await upcomingEventStatus(packet);
    if (timing.status === 'STARTED_OR_FINISHED' || (timing.status === 'UNKNOWN' && !isRecentSourcePost(packet))) {
      throw new Error(timing.status === 'STARTED_OR_FINISHED'
        ? 'This game has already started, so this card cannot be published.'
        : 'This card is too old to verify as an upcoming event. Reject it and use a fresh source post.');
    }
    const sport = normalizedSport(packet);
    if (action === 'free') {
      assertFreePickEligible(packet);
      await enforceDailyFreePickLimit();
    }
    const channel = action === 'free'
      ? await approvedTextChannel(freePickChannelId)
      : await approvedTextChannel(termsOnly ? exclusivesChannelId : (sport ? sportChannelMap.get(sport) : undefined));
    const label = action === 'free' ? 'FREE PICK' : 'PAID PICK';
    const extraction = packet.analysis.extraction;
    const firstPlay = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays[0] : extraction;
    await postAndLogOfficialPick({
      channel,
      payload: { embeds: [buildSourcePickEmbed(packet, label)] },
      entry: {
        pick_id: packet.pick_id,
        operating_date: pacificOperatingDate(),
        event: extraction.event || '',
        sport: extraction.sport || sport || '',
        league: extraction.league || '',
        market: firstPlay.market || extraction.market || '',
        selection: firstPlay.selection || extraction.selection || '',
        published_line: firstPlay.line || extraction.line || '',
        published_odds_american: firstPlay.odds_american || extraction.odds_american || '',
        units_risked: firstExtractedUnits(packet),
        source_name: sourceCapperName(packet),
        credit_text: packet.source.credit_line || '',
        approver: interaction.user.id,
        approved_at: approval.decided_at,
        published_by: client.user?.id || '',
        published_at: new Date().toISOString(),
        destination: `#${channel.name || channel.id}`,
        status: 'PUBLISHED',
        result: 'PENDING',
        notes: `Approved from public X source: ${packet.source.post_url || ''}`
      }
    });
    approval.decision = action === 'free' ? 'FREE_PUBLISHED' : 'PAID_PUBLISHED';
    approval.destination_sport = action === 'free' ? 'free' : sport;
    packet.status = 'PUBLISHED';
    packet.approval = approval;
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await interaction.message.edit({ components: [] });
    let xNote = '';
    if (action === 'free') {
      try {
        const xSync = await syncApprovedFreePickToX(packet);
        xNote = xSync.status === 'disabled' ? ' X sync is disabled.' : ` X sync: ${xSync.status}.`;
      } catch (xError) {
        console.error('Approved Discord free pick was not synced to X', { pickId: packet.pick_id, message: String(xError) });
        xNote = ' Discord post is live; X sync needs attention.';
      }
    }
    await interaction.editReply(`Published to ${channel}.${xNote}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete this approval action.';
    await interaction.editReply(message);
  }
}

function canPostSupportInfo(interaction) {
  return interaction.inGuild() && (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
  );
}

function optionsFrom(interaction) {
  const attachment = interaction.options.getAttachment('image');
  return {
    pickNumber: interaction.options.getInteger('pick_number', true),
    sport: interaction.options.getString('sport', true),
    pick: interaction.options.getString('pick', true),
    event: interaction.options.getString('event', true),
    league: interaction.options.getString('league') || '',
    unitsRisked: interaction.options.getNumber('units_risked', true),
    publishedLine: interaction.options.getString('published_line', true),
    publishedOdds: interaction.options.getInteger('published_odds', true),
    evidence: interaction.options.getString('evidence', true),
    confidence: interaction.options.getNumber('confidence', true),
    imageUrl: interaction.options.getString('image_url') || undefined,
    imageAttachmentUrl: attachment?.url,
    sourceUrl: interaction.options.getString('source_url') || undefined
  };
}

async function destinationFor(interaction, fallbackChannelId, sport = null) {
  const selected = interaction.options.getChannel('channel');
  const channelId = selected?.id || (sport ? sportChannelMap.get(sport) : undefined) || fallbackChannelId;
  if (!channelId) throw new Error('No destination configured. Set PUBLISH_CHANNEL_ID or select an allowed channel.');
  if (allowedChannelIds.size > 0 && !allowedChannelIds.has(channelId)) {
    throw new Error('That channel is not in ALLOWED_CHANNEL_IDS.');
  }
  const channel = selected || await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Configured destination is not a text channel.');
  return channel;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startXMonitor();
  startTrendsSchedule();
});

async function registerCommandsOnStart() {
  if (process.env.AUTO_REGISTER_COMMANDS !== 'true') return;
  if (!process.env.DISCORD_APPLICATION_ID) {
    throw new Error('DISCORD_APPLICATION_ID is required when AUTO_REGISTER_COMMANDS=true.');
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID);
  await rest.put(route, { body: commands });
  console.log(process.env.DISCORD_GUILD_ID ? 'Registered guild commands on startup.' : 'Registered global commands on startup.');
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('source-review:')) {
    try {
      await handleSourceReviewButton(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Unable to complete this review action. No member-facing post was made.');
      } else {
        await interaction.reply({ ephemeral: true, content: 'Unable to complete this review action. No member-facing post was made.' });
      }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === WELCOME_BUTTON_ID) {
    try {
      await interaction.deferReply({ ephemeral: true });
      if (welcomedMemberIds.has(interaction.user.id)) {
        await interaction.editReply('Your welcome was already sent. Check your DMs, including any message requests.');
        return;
      }
      try {
        await interaction.user.send({ embeds: [buildWelcomeDm()] });
        welcomedMemberIds.add(interaction.user.id);
        await interaction.editReply('Welcome sent—check your DMs.');
      } catch (dmError) {
        console.warn(`Welcome DM blocked for ${interaction.user.id}:`, dmError);
        await interaction.editReply({
          content: 'Your DMs are blocked, so here is the same welcome privately in Discord:',
          embeds: [buildWelcomeDm()]
        });
      }
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('I could not send the welcome right now. Please try the button again in a moment.');
      } else {
        await interaction.reply({ ephemeral: true, content: 'I could not send the welcome right now. Please try the button again in a moment.' });
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'hub-help') {
    await interaction.reply({
      ephemeral: true,
      content: 'Use `/preview-pick` to review a numbered, formatted post privately. Once Kobe has approved the exact line, odds, evidence, destination sport/channel, and image rights, a configured publisher can use `/publish-pick`. Administrators can use `/post-welcome-invite` to give current members an opt-in welcome DM. This bot posts as a bot, never as Kobe’s personal account.'
    });
    return;
  }

  if (interaction.commandName === 'post-welcome-invite') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdministrator(interaction)) {
      await interaction.editReply('Only a server administrator can post the member welcome invite.');
      return;
    }
    if (!welcomeChannelId) {
      await interaction.editReply('Set WELCOME_CHANNEL_ID in .env before posting the member welcome invite.');
      return;
    }
    try {
      const channel = await client.channels.fetch(welcomeChannelId);
      if (!channel?.isTextBased()) throw new Error('WELCOME_CHANNEL_ID is not a text channel.');
      await channel.send(buildWelcomeInvite(welcomeRoleId));
      await interaction.editReply(`Welcome invite posted to ${channel}.`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to post the member welcome invite.';
      await interaction.editReply(message);
    }
    return;
  }

  if (interaction.commandName === 'post-support-info') {
    await interaction.deferReply({ ephemeral: true });
    if (!canPostSupportInfo(interaction)) {
      await interaction.editReply('You need the Manage Channels permission to post the support message.');
      return;
    }
    try {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) throw new Error('Choose a text channel for support.');
      await channel.send({
        content: 'Need help with payment or Discord access? Send your issue here and we’ll help.\n\nNever send card details, passwords, login codes, or crypto information.'
      });
      await interaction.editReply(`Support message posted to ${channel}. Pin it from Discord to keep it at the top.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to post the support message.';
      await interaction.editReply(message);
    }
    return;
  }

  if (!isPublisher(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'You are not authorized to publish or preview picks with this bot.' });
    return;
  }

  if (interaction.commandName === 'publish-trends' && !isPickApprover(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'Only Kobe can post a trends sheet to the private approval channel.' });
    return;
  }

  if (interaction.commandName === 'publish-pick' && !isPickApprover(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'Only Kobe can make the final approved pick post.' });
    return;
  }

  try {
    if (interaction.commandName === 'preview-trends' || interaction.commandName === 'publish-trends') {
      await interaction.deferReply({ ephemeral: true });
      const report = await generateTrendReport({
        league: interaction.options.getString('league', true),
        date: interaction.options.getString('date', true)
      });
      const output = await saveTrendReport(report);
      const embeds = reportEmbeds(report);
      if (interaction.commandName === 'preview-trends') {
        await interaction.editReply({ content: `Private research preview saved to ${output}.`, embeds });
        return;
      }
      const channelId = trendsChannelMap.get(report.leagueId);
      if (!channelId) {
        throw new Error(`No approved trends channel is configured for ${report.league}. Set TRENDS_CHANNEL_MAP.`);
      }
      const channel = await approvedTextChannel(channelId);
      for (const embed of embeds) await channel.send({ embeds: [embed] });
      await interaction.editReply(`Private ${report.league} trends sheet posted to ${channel} and saved to durable storage.`);
      return;
    }

    if (interaction.commandName === 'grade-pick') {
      const result = interaction.options.getString('result', true);
      const source = interaction.options.getString('result_source', true);
      const outcome = interaction.options.getString('outcome') || '';
      const pickId = interaction.options.getString('pick_id', true);
      const updated = await updateOfficialPick(pickId, {
        result,
        status: result === 'PENDING' ? 'PENDING' : 'GRADED',
        score_or_outcome: outcome,
        result_verified_source: source,
        result_verified_at: new Date().toISOString(),
        graded_by: interaction.user.id
      });
      const net = netUnitsFor(updated);
      if (net !== null) await updateOfficialPick(pickId, { net_units: net });
      await interaction.reply({
        ephemeral: true,
        content: `${updated.pick_id} recorded as ${result}. Its recap net units will be calculated from the exact published odds and units risked.`
      });
      return;
    }

    const isRecap = interaction.commandName === 'preview-recap' || interaction.commandName === 'publish-recap';
    const attachment = interaction.options.getAttachment('image');
    if (isRecap) {
      const embeds = buildLogRecapEmbeds({
        date: interaction.options.getString('date', true),
        rows: await readPickLog(),
        summary: interaction.options.getString('summary') || '',
        imageUrl: interaction.options.getString('image_url') || undefined,
        imageAttachmentUrl: attachment?.url
      });
      if (interaction.commandName === 'preview-recap') {
        await interaction.reply({ ephemeral: true, embeds });
        return;
      }
      const channel = await destinationFor(interaction, recapChannelId);
      for (const embed of embeds) await channel.send({ embeds: [embed] });
      await interaction.reply({ ephemeral: true, content: `Published the full ${interaction.options.getString('date', true)} recap to ${channel}.` });
      return;
    }

    const pickOptions = optionsFrom(interaction);
    const pickId = makePickId({ sport: pickOptions.sport, pickNumber: pickOptions.pickNumber });
    const embed = buildPickEmbed({ ...pickOptions, pickId });
    if (interaction.commandName === 'preview-pick') {
      await interaction.reply({ ephemeral: true, embeds: [embed] });
      return;
    }

    const channel = await destinationFor(interaction, defaultChannelId, pickOptions.sport.toLowerCase());
    if (channel.id === freePickChannelId) await enforceDailyFreePickLimit();
    await postAndLogOfficialPick({
      channel,
      payload: { embeds: [embed] },
      entry: {
        pick_id: pickId,
        operating_date: pacificOperatingDate(),
        event: pickOptions.event,
        sport: pickOptions.sport,
        league: pickOptions.league,
        market: pickOptions.publishedLine,
        selection: pickOptions.pick,
        published_line: pickOptions.publishedLine,
        published_odds_american: pickOptions.publishedOdds,
        units_risked: pickOptions.unitsRisked,
        source_name: pickOptions.sourceUrl || '',
        published_by: interaction.user.id,
        published_at: new Date().toISOString(),
        destination: `#${channel.name || channel.id}`,
        status: 'PUBLISHED',
        result: 'PENDING',
        notes: 'Published with /publish-pick.'
      }
    });
    await interaction.reply({ ephemeral: true, content: `Published to ${channel}.` });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unable to process this pick.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ephemeral: true, content: message });
    } else {
      await interaction.reply({ ephemeral: true, content: message });
    }
  }
});

async function start() {
  await registerCommandsOnStart();
  await client.login(process.env.DISCORD_TOKEN);
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Exported for integration checks without logging the bot in.
module.exports = { commands };
