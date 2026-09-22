require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { buildPickEmbed, listFromEnv } = require('./lib/pick');
const { buildLogRecapEmbeds, isPublishedRow, recapRows } = require('./lib/recap');
const { buildCapperRecap } = require('./lib/capper-recap');
const { createRecapApprovals, recapApprovalGroups } = require('./lib/recap-approvals');
const { reviewWindow } = require('./lib/recap-schedule');
const recapWorkflow = require('../data/recap-workflow.json');
const referralWorkflow = require('../data/referral-workflow.json');
const { REFERRAL_CARD_MARKER, referralCardPayload } = require('./lib/referral-card');
const exclusiveRecapWorkflow = { ...recapWorkflow, writeup: undefined };
const writeupRecapWorkflow = {
  enabled: recapWorkflow.writeup?.enabled === true,
  guild_id: recapWorkflow.guild_id,
  reviewer_user_ids: recapWorkflow.reviewer_user_ids,
  website_vip_role_id: recapWorkflow.website_vip_role_id,
  ...(recapWorkflow.writeup || {})
};
const recapWorkflowConfigs = [exclusiveRecapWorkflow, writeupRecapWorkflow].filter((config) => config.enabled);
const { freePickRecapRows } = require('./lib/free-recap');
const { buildFreePickResults } = require('./lib/free-pick-results');
const { createGradingFetch, gradePickFromEspn } = require('./lib/espn-grading');
const { buildRecapReview, publicationGradeHold, splitRecapBody } = require('./lib/recap-review');
const { gradeWagerRows, sourcePacketPath } = require('./lib/wager-ledger');
const { appendOfficialPick, makePickId, netUnitsFor, pacificOperatingDate, pickLogPath, readPickLog, resultFor, updateOfficialPick } = require('./lib/pick-log');
const { WELCOME_BUTTON_ID, buildWelcomeInvite, buildWelcomeDm } = require('./lib/welcome');
const {
  assertApprovalCopyMatches,
  assertCompleteWriteup,
  assertFreePickEligible,
  assertPublishableExtraction,
  buildSourcePickApprovalEmbed,
  buildSourcePickEmbed,
  expertOnlyButtonsFromMessage,
  independentWriteupPacket,
  isTermsOnlyMode,
  reviewButtons,
  sourceEvidence,
  sourceCapperName,
  writeupDescription,
  approvalCopySha256
} = require('./lib/source-review');
const { fillMissingEvidence } = require('./lib/espn-pick-research');
const { createFreePickDelivery } = require('./lib/free-pick-delivery');
const { manualFreePickRecord } = require('./lib/manual-free-pick');
const { nearEvenAmericanOdds, assertWriteupOdds } = require('./lib/writeup-odds');
const { createInjuryDelivery, injuryConfig } = require('./lib/injury-reports');
const { createTelegramReader } = require('./lib/telegram-reader');
const { createDailyWriteupBoard, manualFootballWriteupRow } = require('./lib/daily-writeup-board');
const { createFreeWriteupBoard } = require('./lib/free-writeup-board');
const { createVipExpertList } = require('./lib/vip-expert-list');
const { createExpertPulse } = require('./lib/expert-pulse');
const { telegramConfig } = require('./lib/telegram-session');
const { reviewQueuePath } = require('./lib/review-queue-path');
const { exclusiveApprovalChannelId } = require('./lib/approval-routing');
const { datedTimeOverride, nextArizonaDailyStartMs } = require('./lib/daily-window');
const { isSupportedSportPick, upcomingEventStatus } = require('./lib/event-timing');
const { exclusiveSourceIsCurrent } = require('../pipeline/exclusive-text');
const { alreadyPublishedTrend, generateTrendReport, markTrendPublished, reportEmbeds, saveTrendReport } = require('./lib/espn-trends');
const { enrichPacket } = require('../pipeline/enrich-pick');
const { runCollector } = require('../pipeline/collect-x');
const { attachDiscordRestAudit, auditedFetch, recordDiscordPreResponseFailure } = require('../pipeline/api-client');
const {
  auditConfigured,
  initializeAuditStore,
  closeAuditStore,
  recordApprovalAction,
  recordGradeAttempt,
  recordPublicationAttempt,
  recordPublicationResult,
  recordRecapRun,
  recordWorkflowEvent,
  readAuditTimeline
} = require('../pipeline/audit-store');

const required = ['DISCORD_TOKEN'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
}

const publisherRoleIds = listFromEnv(process.env.PUBLISHER_ROLE_IDS);
const allowedChannelIds = listFromEnv(process.env.ALLOWED_CHANNEL_IDS);
// Explicit repository-controlled recap route, not an arbitrary slash-command destination.
for (const workflow of recapWorkflowConfigs) {
  allowedChannelIds.add(workflow.review_channel_id);
  allowedChannelIds.add(workflow.destination_channel_id);
}
const defaultChannelId = process.env.PUBLISH_CHANNEL_ID;
const recapChannelId = process.env.RECAP_CHANNEL_ID || defaultChannelId;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const welcomeRoleId = process.env.WELCOME_ROLE_ID;
const freePickChannelId = process.env.FREE_PICK_CHANNEL_ID;
const freeRecapChannelId = process.env.FREE_RECAP_CHANNEL_ID || recapChannelId;
const freeRecapStatePath = path.join(path.dirname(pickLogPath()), 'free-recap-state.json');
const dailyWriteupsChannelId = process.env.DAILY_WRITEUPS_CHANNEL_ID;
const configuredFreeWriteupsChannelId = process.env.FREE_WRITEUPS_CHANNEL_ID;
const vipExpertListChannelId = process.env.VIP_EXPERT_LIST_CHANNEL_ID;
const vipExpertPulseChannelId = process.env.VIP_EXPERT_PULSE_CHANNEL_ID;
const vipExpertPulseApprovalChannelId = process.env.VIP_EXPERT_PULSE_APPROVAL_CHANNEL_ID;
if (vipExpertListChannelId) allowedChannelIds.add(vipExpertListChannelId);
if (vipExpertPulseChannelId) allowedChannelIds.add(vipExpertPulseChannelId);
if (vipExpertPulseApprovalChannelId) allowedChannelIds.add(vipExpertPulseApprovalChannelId);
if (configuredFreeWriteupsChannelId) allowedChannelIds.add(configuredFreeWriteupsChannelId);
if (dailyWriteupsChannelId) allowedChannelIds.add(dailyWriteupsChannelId);
let manualFootballWriteupRows = [];
let newestFootballWriteupMessageId = null;
let manualFootballHistoryLoaded = false;
let manualFootballArchiveStartId = null;

async function readManualFootballWriteups() {
  const channelId = sportChannelMap.get('football');
  if (!channelId) return [];
  const channel = await approvedTextChannel(channelId);
  const collected = [];
  if (!manualFootballHistoryLoaded) {
    let before;
    for (let page = 0; page < 100; page += 1) {
      const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!messages.size) break;
      collected.push(...messages.values());
      before = messages.last().id;
      if (messages.size < 100) break;
    }
    manualFootballHistoryLoaded = true;
  } else if (newestFootballWriteupMessageId) {
    const messages = await channel.messages.fetch({ limit: 100, after: newestFootballWriteupMessageId });
    collected.push(...messages.values());
  }
  const chronological = collected.sort((a, b) => a.id.localeCompare(b.id));
  if (!manualFootballArchiveStartId) {
    const anchor = chronological.find((message) => /\b(?:boutte|boute)\b/i.test(message.content || ''));
    if (anchor) manualFootballArchiveStartId = anchor.id;
  }
  for (const message of chronological) {
    if (!newestFootballWriteupMessageId || BigInt(message.id) > BigInt(newestFootballWriteupMessageId)) newestFootballWriteupMessageId = message.id;
    if (manualFootballArchiveStartId && BigInt(message.id) < BigInt(manualFootballArchiveStartId)) continue;
    const row = manualFootballWriteupRow(message, dailyPickOperatingDate);
    if (row && !manualFootballWriteupRows.some((entry) => entry.source_message_id === row.source_message_id)) manualFootballWriteupRows.push(row);
  }
  return manualFootballWriteupRows;
}

async function allWriteupRows() {
  const rows = [...await readPickLog(), ...await readManualFootballWriteups()];
  return Promise.all(rows.map(async (row) => {
    if (row.teaser_source || row.status !== 'PUBLISHED' || !/writeups?/i.test(row.destination || '')) return row;
    const match = String(row.post_reference || '').match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)\/(\d+)/);
    if (!match) return row;
    try {
      const channel = await approvedTextChannel(match[1]);
      const message = await channel.messages.fetch(match[2]);
      return { ...row, teaser_source: [message.content, ...message.embeds.map((embed) => embed.description)].filter(Boolean).join('\n') };
    } catch (error) {
      console.warn('Writeup teaser source unavailable:', row.pick_id, error.message);
      return row;
    }
  }));
}

const dailyWriteupBoard = dailyWriteupsChannelId ? createDailyWriteupBoard({
  channelFor: () => approvedTextChannel(dailyWriteupsChannelId),
  rowsFor: allWriteupRows,
  stateFile: path.join(path.dirname(pickLogPath()), 'daily-writeups-board.json'),
  operatingDate: () => dailyPickOperatingDate(new Date())
}) : null;
let freeWriteupBoard = null;
// Every source-only approval now has one member destination: #expert-picks.
// PUBLISH_CHANNEL_ID is the established production expert-picks route; the
// explicit alias allows a future rename without reintroducing alternatives.
const expertPicksChannelId = process.env.EXPERT_PICKS_CHANNEL_ID || defaultChannelId;
const vipExpertList = vipExpertListChannelId ? createVipExpertList({
  sourceChannelFor: () => approvedTextChannel(expertPicksChannelId),
  listChannelFor: () => approvedTextChannel(vipExpertListChannelId),
  stateFile: path.join(path.dirname(pickLogPath()), 'vip-expert-list.json')
}) : null;
const expertPulse = vipExpertPulseChannelId && vipExpertPulseApprovalChannelId ? createExpertPulse({
  sourceChannelFor: () => approvedTextChannel(expertPicksChannelId),
  reviewChannelFor: () => approvedTextChannel(vipExpertPulseApprovalChannelId),
  destinationChannelFor: () => approvedTextChannel(vipExpertPulseChannelId),
  // Reconstruct every exact wager from the immutable review packet and its
  // saved grade. An unexpanded source group must never inherit one result.
  rowsFor: async () => {
    const rows = await readPickLog();
    const byDate = new Map();
    for (const row of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.operating_date || '')) continue;
      if (!byDate.has(row.operating_date)) byDate.set(row.operating_date, []);
      byDate.get(row.operating_date).push(row);
    }
    const results = await Promise.all([...byDate].map(async ([date, dailyRows]) => gradeWagerRows({
      rows: dailyRows, date, root: reviewQueueRoot,
      file: path.join(path.dirname(pickLogPath()), `wager-results-${date}.json`),
      grade: async () => ({ status: 'PENDING', reason: 'Digest never grades results.' })
    })));
    return results.flatMap((result) => result.rows);
  },
  paidChannelIds: () => [expertPicksChannelId, ...sportChannelMap.values(), process.env.EXCLUSIVES_CHANNEL_ID].filter(Boolean),
  isApprover: ({ userId, ownerId }) => userId === ownerId || pickApproverUserIds.has(userId),
  stateFile: path.join(path.dirname(pickLogPath()), 'expert-pulse.json')
}) : null;
const refreshExpertPulse = expertPulse ? () => expertPulse.refresh() : null;
if ((vipExpertPulseChannelId || vipExpertPulseApprovalChannelId) && !expertPulse) {
  console.error('VIP expert pulse is held: both private review and private destination channel IDs are required.');
}
const pickApprovalChannelId = process.env.PICK_APPROVAL_CHANNEL_ID;
const exclusivePickApprovalChannelId = exclusiveApprovalChannelId();
const sourcesPath = path.join(__dirname, '..', 'data', 'twitter-sources.json');
const pickWorkflowPath = path.join(__dirname, '..', 'data', 'pick-workflow.json');
const trendsChannelMap = new Map(
  (process.env.TRENDS_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([league, channelId]) => league && channelId)
    .map(([league, channelId]) => [league.toLowerCase(), channelId])
);
const pickApproverUserIds = listFromEnv(process.env.PICK_APPROVER_USER_IDS);
const reviewQueueRoot = reviewQueuePath();
const trendsInboxQueueUrl = (process.env.TRENDS_INBOX_QUEUE_URL || '').replace(/\/$/, '');
const trendsInboxQueueSecret = process.env.TRENDS_INBOX_QUEUE_SECRET || '';
const recapNotificationQueueUrl = (process.env.RECAP_NOTIFICATION_QUEUE_URL || '').replace(/\/$/, '');
const recapNotificationQueueSecret = (process.env.RECAP_NOTIFICATION_QUEUE_SECRET || '').trim();
const recapNotificationRecipient = (process.env.KOBE_RECAP_EMAIL || process.env.KOBE_APPROVAL_EMAIL || '').trim();
const sportChannelMap = new Map(
  (process.env.SPORT_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([sport, channelId]) => sport && channelId)
    .map(([sport, channelId]) => [sport.toLowerCase(), channelId])
);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });

async function ensureFreeWriteupsChannel() {
  if (configuredFreeWriteupsChannelId) return approvedTextChannel(configuredFreeWriteupsChannelId);
  if (!freePickChannelId) throw new Error('FREE_PICK_CHANNEL_ID is required to create the public Free Writeups channel safely.');
  const source = await approvedTextChannel(freePickChannelId);
  const channels = await source.guild.channels.fetch();
  const existing = channels.find((channel) => channel?.isTextBased?.() && channel.name === 'free-writeups');
  if (existing) return existing;
  const created = await source.clone({ name: 'free-writeups', reason: 'Owner requested a separate public writeup-preview channel.' });
  await created.setTopic('Free previews of today’s writeups. Exact plays, lines, odds, and full reasoning remain inside VIP.');
  console.log(`Created public Free Writeups channel ${created.id} from the existing Free Pick permissions.`);
  return created;
}
attachDiscordRestAudit(client.rest, {
  callerComponent: 'bot/index',
  triggerType: 'discord_bot'
});
const welcomedMemberIds = new Set();
let xCollectionInProgress = false;
let xMonitorIntervalTimer = null;
let xMonitorStopTimer = null;
let xMonitorDailyTimer = null;
let trendsTimer = null;
let trendsPublicationInProgress = false;
let trendsInboxTimer = null;
let trendsInboxInProgress = false;
let freeRecapTimer = null;
let freeRecapInProgress = false;
let freePickDeliveryTimer = null;
let injuryTimer = null;
let injuryDelivery = null;
let telegramTimer = null;
let telegramStopTimer = null;
let telegramDailyTimer = null;
let telegramReader = null;

async function ensureReferralInfoCard() {
  if (!referralWorkflow.enabled) return;
  const channel = await client.channels.fetch(referralWorkflow.channel_id, { force: true });
  if (!channel?.isTextBased() || channel.guildId !== referralWorkflow.guild_id
    || channel.guildId !== process.env.DISCORD_GUILD_ID || !/refer/i.test(channel.name || '')) {
    throw new Error('Unexpected referral information channel.');
  }
  const permissions = channel.permissionsFor(client.user);
  if (![PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory].every((flag) => permissions?.has(flag))) {
    throw new Error('Kobe Bot needs View Channel, Send Messages, Embed Links and Read Message History in the referral channel.');
  }
  const payload = referralCardPayload(referralWorkflow);
  const messages = await channel.messages.fetch({ limit: 100 });
  const existing = [...messages.values()].find((message) => message.author?.id === client.user.id
    && message.embeds?.[0]?.footer?.text?.startsWith(REFERRAL_CARD_MARKER));
  if (existing) {
    await existing.edit(payload);
    return { status: 'UPDATED', messageId: existing.id };
  }
  const message = await channel.send(payload);
  return { status: 'CREATED', messageId: message.id };
}

async function cachedRecapGroups(date, workflow = exclusiveRecapWorkflow) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid recap date.');
  const result = await gradeWagerRows({ rows: await readPickLog(), date, root: reviewQueueRoot,
    file: path.join(path.dirname(pickLogPath()), `wager-results-${date}.json`),
    grade: async () => ({ status: 'PENDING', reason: 'Verified result not yet available.' }) });
  return recapApprovalGroups({ date, rows: result.rows, sourceChannelIds: workflow.source_channel_ids });
}

function recapApprovalEngine(workflow, directory, recapType) {
  return createRecapApprovals({
  root: path.join(path.dirname(pickLogPath()), directory), config: workflow,
  loadGroups: (date) => cachedRecapGroups(date, workflow), paused: pickWorkflowPaused,
  channelFor: async (id, purpose) => {
    if (!allowedChannelIds.has(id)) throw new Error('Recap destination is not allowlisted.');
    const channel = await client.channels.fetch(id, { force: true });
    if (!channel?.isTextBased()) throw new Error('Recap destination is not a text channel.');
    if (channel.guildId !== workflow.guild_id || channel.guildId !== process.env.DISCORD_GUILD_ID) throw new Error('Unexpected recap server.');
    if (purpose === 'review') {
      const everyone = channel.permissionOverwrites.cache.get(channel.guildId);
      const vip = channel.permissionOverwrites.cache.get(workflow.website_vip_role_id);
      if (!everyone?.deny.has(PermissionFlagsBits.ViewChannel) || vip?.allow.has(PermissionFlagsBits.ViewChannel)) {
        throw new Error('Recap review channel must be private before any draft is delivered.');
      }
    }
    const permissions = channel.permissionsFor(client.user);
    if (![PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory].every(flag => permissions?.has(flag))) {
      throw new Error('Kobe Bot needs View Channel, Send Messages, Embed Links and Read Message History in the configured recap channel.');
    }
    return channel;
  },
  audit: (state, status) => recordRecapRun({ operatingDate: state.date, recapType,
    includedPickIds: state.includedPickIds, status, content: state.body,
    providerMessageId: (status === 'PUBLISHED' ? state.publicReceipts : state.reviewReceipts).map(receipt => receipt?.id).filter(Boolean).join(','),
    details: { capper: state.name, snapshot: state.digest, actor_id: state.actorId || null,
      workflow_id: workflow.workflow_id, review_channel_id: workflow.review_channel_id,
      destination_channel_id: workflow.destination_channel_id } })
  });
}

const recapApprovalWorkflows = [
  { config: exclusiveRecapWorkflow, label: 'exclusive', engine: recapApprovalEngine(exclusiveRecapWorkflow, 'exclusive-recap-approvals', 'exclusive_discord_approval') },
  ...(writeupRecapWorkflow.enabled
    ? [{ config: writeupRecapWorkflow, label: 'writeup', engine: recapApprovalEngine(writeupRecapWorkflow, 'writeup-recap-approvals', 'writeup_discord_approval') }]
    : [])
];

async function queueDiscordRecapApprovals(date, rows) {
  if (!recapApprovalWorkflows.length) return;
  const due = reviewWindow({ date, today: pacificOperatingDate(), yesterday: previousPacificOperatingDate(), time: arizonaTimeNow(), morningAt: process.env.RECAP_MORNING_REVIEW_AT || '07:00' });
  if (!due) return;
  for (const workflow of recapApprovalWorkflows) {
    const groups = rows
      ? recapApprovalGroups({ date, rows, sourceChannelIds: workflow.config.source_channel_ids })
      : await cachedRecapGroups(date, workflow.config);
    if (!groups.length) continue;
    try {
      const receipts = await workflow.engine.prepare(groups);
      if (receipts.length) console.log(`Private ${workflow.label} recap approval receipts:`, JSON.stringify(receipts));
    } catch (error) {
      console.error(`Private ${workflow.label} recap approval delivery needs attention:`, error.message);
    }
  }
}

function stopTelegramMonitor(reason) {
  if (telegramTimer) {
    clearInterval(telegramTimer);
    telegramTimer = null;
  }
  if (telegramStopTimer) {
    clearTimeout(telegramStopTimer);
    telegramStopTimer = null;
  }
  console.log(`Telegram exclusive monitoring stopped: ${reason}`);
  const dailyAt = xMonitorDailyAt();
  if (dailyAt && process.env.TELEGRAM_READER_ENABLED === 'true' && !telegramDailyTimer) {
    const nextStart = nextArizonaDailyStartMs(dailyAt);
    telegramDailyTimer = setTimeout(() => {
      telegramDailyTimer = null;
      beginDailyTelegramMonitor();
    }, Math.max(0, nextStart - Date.now()));
    telegramDailyTimer.unref();
    console.log(`Telegram exclusive monitoring will resume at ${new Date(nextStart).toISOString()} for the next X-aligned daily window.`);
  }
}

function beginDailyTelegramMonitor() {
  const dailyAt = xMonitorDailyAt();
  if (!dailyAt || process.env.TELEGRAM_READER_ENABLED !== 'true' || !telegramReader) return;
  const now = new Date();
  const currentTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(now);
  if (currentTime < dailyAt) {
    const startAt = nextArizonaDailyStartMs(dailyAt, now);
    telegramDailyTimer = setTimeout(() => {
      telegramDailyTimer = null;
      beginDailyTelegramMonitor();
    }, Math.max(0, startAt - now.getTime()));
    telegramDailyTimer.unref();
    console.log(`Telegram exclusive monitoring is scheduled to begin at ${new Date(startAt).toISOString()} (${dailyAt} Arizona time).`);
    return;
  }
  const dailyStopAt = xMonitorDailyStopAt();
  if (dailyStopAt && currentTime >= dailyStopAt) {
    stopTelegramMonitor(`today's X-aligned cutoff of ${dailyStopAt} Arizona time has passed`);
    return;
  }
  const interval = xMonitorIntervalMs();
  const run = () => void telegramReader.run().then(receipts => console.log('Cloud Telegram receipts:', JSON.stringify(receipts)));
  run();
  telegramTimer = setInterval(run, interval);
  telegramTimer.unref();
  console.log(`Telegram exclusive monitoring enabled at ${currentTime} Arizona time: checking every ${Math.round(interval / 60000)} minute(s) in the same ${dailyAt}-${dailyStopAt || 'open'} window as X; private approvals only.`);
  if (dailyStopAt) {
    const stopAtMs = arizonaDailyTimestampMs(dailyStopAt);
    telegramStopTimer = setTimeout(() => stopTelegramMonitor(`X-aligned daily cutoff of ${dailyStopAt} Arizona time reached`), Math.max(0, stopAtMs - Date.now()));
    telegramStopTimer.unref();
  }
}

function startTelegramReader() {
  if (process.env.TELEGRAM_READER_ENABLED !== 'true' || telegramReader) return;
  let config;
  try { config = telegramConfig(); }
  catch { console.error('Telegram configuration needs attention; existing Discord services remain active.'); return; }
  telegramReader = createTelegramReader({ config, channelFor: async () => {
    const channel = await approvedTextChannel(exclusivePickApprovalChannelId);
    const usesLegacyFallback = exclusivePickApprovalChannelId === pickApprovalChannelId;
    const expectedName = usesLegacyFallback ? /pick.approvals/i : /exclusive.*pick.*approvals/i;
    if (channel.guildId !== process.env.DISCORD_GUILD_ID || !expectedName.test(channel.name || '')) throw new Error('Unexpected private Telegram approval destination.');
    return channel;
  }, maxModelCalls: xMonitorModelCallLimit() ?? 2 });
  if (xMonitorDailyAt()) {
    beginDailyTelegramMonitor();
    return;
  }
  const run = () => void telegramReader.run().then(receipts => console.log('Cloud Telegram receipts:', JSON.stringify(receipts)));
  const interval = xMonitorIntervalMs();
  run(); telegramTimer = setInterval(run, interval); telegramTimer.unref();
  console.log(`Laptop-independent Telegram reader enabled: selected CAPPERS FREE channel only, private approvals only; checking every ${Math.round(interval / 60000)} minute(s).`);
}

function startInjuryReports() {
  let config;
  try { config = injuryConfig(); }
  catch { console.error('Injury configuration needs attention; existing Discord services remain active.'); return; }
  if (!config.enabled || !config.routes.length || injuryTimer) return;
  injuryDelivery = createInjuryDelivery({
    root: path.join(path.dirname(pickLogPath()), 'injury-reports'), routes: config.routes,
    channelFor: async (id) => {
      const channel = await approvedTextChannel(id);
      if (channel.guildId !== process.env.DISCORD_GUILD_ID || !/injur/i.test(channel.name || '')) throw new Error('Unexpected injury destination.');
      return channel;
    }
  });
  const run = () => void injuryDelivery.run().then(receipts => console.log('Cloud injury receipts:', JSON.stringify(receipts)));
  run(); injuryTimer = setInterval(run, 900000); injuryTimer.unref();
  console.log('Laptop-independent injury reports active: NFL and MLB, 15-minute updates, persistent daily message receipts.');
}

function canonicalFreePacket(row) {
  return {
    pick_id: row.pick_id,
    source: { publish_mode: 'independent_writeup' },
    analysis: { extraction: {
      sport: row.sport, league: row.league, event: row.event,
      selection: row.selection, line: row.published_line,
      odds_american: row.published_odds_american, units: row.units_risked,
      source_claims: []
    } }
  };
}

const manualFreePackets = new Map();

async function ingestManualFreePicks(date) {
  if (!freePickChannelId || !process.env.DISCORD_GUILD_ID) return;
  const channel = await approvedTextChannel(freePickChannelId);
  const messages = await channel.messages.fetch({ limit: 100 });
  const existingIds = new Set((await readPickLog()).map((row) => row.pick_id));
  const records = [...messages.values()]
    .map((message) => {
      const authorizedIds = new Set(pickApproverUserIds);
      if (message.member?.roles?.cache?.some((role) => publisherRoleIds.has(role.id))) authorizedIds.add(message.author.id);
      if (message.guild?.ownerId === message.author.id) authorizedIds.add(message.author.id);
      return manualFreePickRecord(message, {
        operatingDate: dailyPickOperatingDate,
        guildId: process.env.DISCORD_GUILD_ID,
        channelId: freePickChannelId,
        approverIds: authorizedIds,
      });
    })
    .filter((record) => record?.row.operating_date === date)
    .sort((a, b) => a.row.published_at.localeCompare(b.row.published_at));
  for (const record of records) {
    manualFreePackets.set(record.row.pick_id, record.packet);
    if (!existingIds.has(record.row.pick_id)) {
      await appendOfficialPick(record.row);
      existingIds.add(record.row.pick_id);
      console.log(`Indexed authorized manual Free Pick ${record.row.pick_id} for website/X delivery.`);
    }
  }
}

const freePickDelivery = createFreePickDelivery({
  root: path.join(path.dirname(pickLogPath()), 'free-pick-delivery'),
  channelId: freePickChannelId,
  readRows: readPickLog,
  ingest: ingestManualFreePicks,
  paused: pickWorkflowPaused,
  loadPacket: async (row) => {
    if (manualFreePackets.has(row.pick_id)) return manualFreePackets.get(row.pick_id);
    if (/^\d{8}-\d+-X$/.test(row.pick_id)) {
      try {
        const packet = JSON.parse(await fs.readFile(path.join(reviewQueueRoot, row.operating_date, `${row.pick_id.replace(/-X$/, '')}.json`), 'utf8'));
        return independentWriteupPacket(packet);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return canonicalFreePacket(row);
  },
  verifyPost: async (row) => {
    const ref = row.post_reference.match(/\/channels\/(\d+)\/(\d+)\/(\d+)$/);
    if (!ref || ref[2] !== freePickChannelId) return false;
    const channel = await client.channels.fetch(ref[2]);
    const message = await channel.messages.fetch(ref[3]);
    return message.author.id === row.published_by;
  },
  notify: async (row, site) => queueRecapNotification({
    id: `free-pick-social-${row.pick_id}`,
    subject: `Kobe's Betting Hub — Instagram Story ready (${row.operating_date})`,
    body: `The approved Free Pick social package is ready.\n\nInstagram Story JPEG (1080×1920): ${site.storyUrl}\nApproved Discord post: ${row.post_reference}\n\nReview the visible terms and post manually from the official Instagram account. Do not edit the pick terms.`
  })
});

function startFreePickDelivery() {
  if (!freePickChannelId || freePickDeliveryTimer) return;
  const run = () => freePickDelivery.run().then((results) => {
    for (const receipt of results) console.log('Free Pick delivery receipt:', JSON.stringify(receipt));
  }).catch(() => console.error('Free Pick delivery recovery failed safely.'));
  void run();
  freePickDeliveryTimer = setInterval(run, 60000);
  freePickDeliveryTimer.unref();
  console.log('Free Pick delivery recovery active: current-day approved canonical posts only; 60-second interval.');
}

function startFreePickResultsSync() {
  const secret = process.env.FREE_PICK_SITE_PUBLISH_SECRET;
  if (!freePickChannelId || !secret) {
    console.warn('Verified Free Pick results website sync is not configured.');
    return;
  }
  const origin = (process.env.FREE_PICK_SITE_PUBLISH_URL || 'https://bettinghub-publisher.kobedirwin.workers.dev').replace(/\/$/, '');
  let lastContent = '';
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const snapshot = buildFreePickResults(await readPickLog(), dailyPickOperatingDate(new Date()), freePickChannelId);
      const content = JSON.stringify({ ...snapshot, generatedAt: null });
      if (content === lastContent) return;
      const response = await fetch(`${origin}/api/free-pick/results`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`website returned ${response.status}`);
      lastContent = content;
      console.log('Verified Free Pick results updated on the website.');
    } catch (error) {
      console.error('Verified Free Pick results sync needs attention:', error.message);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60000);
  timer.unref();
}

// A shared kill switch for new public pick posts. The collector has its own
// matching check, while this one protects existing Discord approval cards and
// manual /publish-pick posts during a pause.
async function pickWorkflowPaused() {
  try {
    const setting = JSON.parse(await fs.readFile(pickWorkflowPath, {
      encoding: 'utf8',
      signal: AbortSignal.timeout(2000)
    }));
    return setting.paused === true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    console.error('Unable to read pick workflow pause setting; blocking pick publication.', error);
    return true;
  }
}

function xMonitorIntervalMs(now = new Date()) {
  const overrideDate = (process.env.X_MONITOR_INTERVAL_OVERRIDE_DATE || '').trim();
  const overrideMs = (process.env.X_MONITOR_INTERVAL_OVERRIDE_MS || '').trim();
  const today = pacificClock(now).date;
  const configured = Number(overrideDate && overrideMs && today >= overrideDate
    ? overrideMs
    : (process.env.X_MONITOR_INTERVAL_MS || 300000));
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

function freeRecapEnabled() {
  // This is an administrative email generated entirely from the canonical log.
  return process.env.FREE_RECAP_ENABLED !== 'false';
}

function recapEmailConfigured() {
  return Boolean(recapNotificationQueueUrl && recapNotificationQueueSecret && recapNotificationRecipient);
}

function freeRecapCloseAt() {
  // Do not finalize a day's recap while new free picks can still be approved.
  // This defaults to the existing 11:00–15:00 Arizona X-monitoring window.
  const value = (process.env.FREE_RECAP_CLOSE_AT || xMonitorDailyStopAt() || '15:00').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    console.warn('Ignoring invalid FREE_RECAP_CLOSE_AT. Use HH:MM in Arizona time, for example 15:00.');
    return null;
  }
  return value;
}

function freeRecapIntervalMs() {
  const configured = Number(process.env.FREE_RECAP_INTERVAL_MS || 300000);
  return Number.isFinite(configured) && configured >= 60000 ? configured : 300000;
}

function arizonaTimeNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

function previousPacificOperatingDate(now = new Date()) {
  const [year, month, day] = pacificOperatingDate(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function readFreeRecapState() {
  try {
    return JSON.parse(await fs.readFile(freeRecapStatePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { dates: {} };
    throw error;
  }
}

async function saveFreeRecapState(state) {
  await fs.mkdir(path.dirname(freeRecapStatePath), { recursive: true });
  await fs.writeFile(freeRecapStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function queueRecapNotification({ id, subject, body }) {
  if (!recapNotificationQueueUrl || !recapNotificationQueueSecret || !recapNotificationRecipient) return 'NOT_CONFIGURED';
  const response = await auditedFetch(`${recapNotificationQueueUrl}/api/queue/recap-notifications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${recapNotificationQueueSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, recipient: recapNotificationRecipient, subject, body })
  }, {
    service: 'cloudflare-worker',
    endpointClass: '/api/queue/recap-notifications',
    callerComponent: 'bot/index',
    triggerType: 'recap_queue',
    workflowId: id
  });
  if (response.status === 409) return 'ALREADY_QUEUED';
  if (!response.ok) throw new Error(`Recap email queue returned ${response.status}.`);
  return 'QUEUED';
}

async function autoGradePendingOfficialPicks(date, fetchImpl = fetch) {
  const attempts = new Map();
  if (process.env.AUTO_GRADE_FREE_PICKS === 'false') return attempts;
  const rows = await readPickLog();
  const pending = rows.filter((row) => (
    row.operating_date === date
    && isPublishedRow(row)
    && resultFor(row) === 'PENDING'
  ));
  for (const row of pending) {
    await recordGradeAttempt({ pickId: row.pick_id, result: null, status: 'STARTED', provider: 'ESPN' });
    let groupedSourceReason = '';
    const packetPath = sourcePacketPath(reviewQueueRoot, row.pick_id);
    if (packetPath) {
      try {
        const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'));
        groupedSourceReason = publicationGradeHold(row, packet);
      } catch {
        groupedSourceReason = publicationGradeHold(row, null);
      }
    }
    const grade = groupedSourceReason ? { status: 'PENDING', reason: groupedSourceReason } : await gradePickFromEspn(row, { fetchImpl });
    attempts.set(row.pick_id, grade);
    if (grade.status !== 'GRADED') {
      await recordGradeAttempt({
        pickId: row.pick_id,
        result: null,
        status: grade.status || 'PENDING',
        provider: 'ESPN',
        sourceReference: grade.source || null,
        snapshot: grade,
        errorDetail: grade.reason || 'Not enough verified ESPN data.'
      });
      console.log(`Automatic grading kept ${row.pick_id} pending: ${grade.reason || 'not enough verified ESPN data'}.`);
      continue;
    }
    const updated = await updateOfficialPick(row.pick_id, {
      result: grade.result,
      status: 'GRADED',
      score_or_outcome: grade.outcome,
      result_verified_source: `Verified final result: ${grade.source}`,
      result_verified_at: new Date().toISOString(),
      graded_by: grade.source.includes('wtatennis.com/') ? 'reviewed:primary-source' : 'auto:espn'
    });
    const net = netUnitsFor(updated);
    if (net !== null) await updateOfficialPick(row.pick_id, { net_units: net });
    await recordGradeAttempt({
      pickId: row.pick_id,
      result: grade.result,
      status: 'GRADED',
      provider: 'ESPN',
      sourceReference: grade.source || null,
      snapshot: grade
    });
    console.log(`Automatically graded ${row.pick_id} as ${grade.result} from ESPN.`);
  }
  return attempts;
}

function recapEmailBody(embeds) {
  return embeds.map((embed) => embed.description || '').filter(Boolean).join('\n\n');
}

async function queueRecapParts({ id, subject, body }) {
  const parts = splitRecapBody(body);
  for (let index = 0; index < parts.length; index += 1) {
    await queueRecapNotification({
      id: parts.length === 1 ? id : `${id}-part-${index + 1}`,
      subject: parts.length === 1 ? subject : `${subject} (${index + 1}/${parts.length})`,
      body: parts[index]
    });
  }
  return 'QUEUED';
}

async function queueMorningRecapReview({ date, rows, attempts, state }) {
  const window = reviewWindow({ date, today: pacificOperatingDate(), yesterday: previousPacificOperatingDate(), time: arizonaTimeNow(), morningAt: process.env.RECAP_MORNING_REVIEW_AT || '07:00' });
  if (!window) return;
  const statusKey = window.key === 'nightly' ? 'review_status' : 'morning_review_status';
  const snapshotKey = window.key === 'nightly' ? 'review_snapshot' : 'morning_review_snapshot';
  const prior = state.dates?.[date] || {};
  if (prior[statusKey] === 'QUEUED') return;
  // Persist a fixed snapshot before delivery so partial-send retries cannot
  // mix different result snapshots under the same idempotency keys.
  const review = prior[snapshotKey] || buildRecapReview({ date, rows, attempts });
  if (!review) return;
  state.dates = { ...(state.dates || {}), [date]: { ...prior, [snapshotKey]: review, [statusKey]: 'PREPARED' } };
  await saveFreeRecapState(state);
  for (let index = 0; index < review.parts.length; index += 1) {
    await queueRecapNotification({
      id: `${window.id}-part-${index + 1}`,
      subject: `Kobe's Betting Hub — Private ${window.label} recap review (${date}) ${index + 1}/${review.parts.length}`,
      body: review.parts[index]
    });
  }
  await recordRecapRun({ operatingDate: date, includedPickIds: review.includedPickIds,
    status: 'REVIEW_QUEUED', recipient: recapNotificationRecipient,
    content: review.parts.join(''), details: { provisional: true, parts: review.parts.length, window: window.key } });
  state.dates[date] = { ...state.dates[date], [statusKey]: 'QUEUED', [`${window.key}_review_queued_at`]: new Date().toISOString() };
  await saveFreeRecapState(state);
  console.log(`Private ${window.label} recap review for ${date} queued in ${review.parts.length} part(s); unresolved results remain explicitly pending.`);
}

async function publishDueFreeRecap(date) {
  if (freeRecapInProgress || (!recapEmailConfigured() && !recapWorkflow.enabled)) return;
  if (!reviewWindow({ date, today: pacificOperatingDate(), yesterday: previousPacificOperatingDate(), time: arizonaTimeNow(), morningAt: process.env.RECAP_MORNING_REVIEW_AT || '07:00' })) return;
  freeRecapInProgress = true;
  try {
    const state = await readFreeRecapState();
    const prior = state.dates?.[date];
    if (prior?.status === 'EMAIL_SENT') {
      await queueDiscordRecapApprovals(date);
      return;
    }
    if (prior?.status === 'PUBLISHED') {
      // A recap can be posted before the optional email queue is configured. Once
      // configured, catch that one up without reposting the Discord recap.
      const emailAlreadyHandled = ['QUEUED', 'ALREADY_QUEUED'].includes(prior.email_status);
      if (!emailAlreadyHandled) {
        const rows = await readPickLog();
        const embeds = buildLogRecapEmbeds({ date, rows });
        const includedPickIds = recapRows(rows, date).map((row) => row.pick_id);
        const legacyRecap = buildCapperRecap({ date, rows });
        if (legacyRecap.pending) throw new Error('Legacy final recap requires verified individual-wager results before recovery.');
        const content = legacyRecap.body;
        await recordRecapRun({ operatingDate: date, includedPickIds, status: 'EMAIL_SEND_STARTED', recipient: recapNotificationRecipient, content, details: { recovered_from_legacy_state: true } });
        const emailStatus = await queueRecapParts({
          id: `official-recap-final-${date}`,
          subject: `Kobe's Betting Hub — Daily Recap (${date})`,
          body: content
        });
        await recordRecapRun({ operatingDate: date, includedPickIds, status: emailStatus, recipient: recapNotificationRecipient, content, details: { recovered_from_legacy_state: true } });
        state.dates[date] = { ...prior, email_status: emailStatus, email_queued_at: new Date().toISOString() };
        await saveFreeRecapState(state);
      }
      await queueDiscordRecapApprovals(date);
      return;
    }
    let rows = await readPickLog();
    let picks = rows.filter((row) => (
      row.operating_date === date
      && isPublishedRow(row)
    ));
    if (!picks.length) {
      console.log(`No successfully published official picks were logged for ${date}; no recap email was sent.`);
      return;
    }
    const gradingFetch = createGradingFetch();
    const gradingAttempts = await autoGradePendingOfficialPicks(date, gradingFetch);
    rows = await readPickLog();
    const wagers = await gradeWagerRows({ rows, date, root: reviewQueueRoot,
      file: path.join(path.dirname(pickLogPath()), `wager-results-${date}.json`),
      grade: process.env.AUTO_GRADE_FREE_PICKS === 'false'
        ? async () => ({ status: 'PENDING', reason: 'Automatic grading is disabled.' })
        : row => gradePickFromEspn(row, { fetchImpl: gradingFetch }),
      onAttempt: async (parentId, wagerId, attempt) => recordGradeAttempt({
        pickId: parentId, result: attempt.result || null, status: attempt.status || 'PENDING',
        provider: 'ESPN', sourceReference: attempt.source || null,
        snapshot: { ...attempt, wager_id: wagerId }, errorDetail: attempt.reason || null
      }) });
    rows = wagers.rows;
    for (const [id, attempt] of wagers.attempts) gradingAttempts.set(id, attempt);
    picks = recapRows(rows, date);
    await queueDiscordRecapApprovals(date, rows);
    // Discord review remains operational if the optional email sender is absent.
    if (!recapEmailConfigured()) return;
    await queueMorningRecapReview({ date, rows, attempts: gradingAttempts, state });
    if (picks.some((row) => resultFor(row) === 'PENDING')) {
      const pending = picks.filter((row) => resultFor(row) === 'PENDING');
      const isCurrentOperatingDay = date === pacificOperatingDate();
      const closeAt = freeRecapCloseAt();
      if (isCurrentOperatingDay && (!closeAt || arizonaTimeNow() < closeAt)) {
        console.log(`Official recap for ${date} will become eligible after the ${closeAt || 'configured'} Arizona pick window closes.`);
        return;
      }
      // A live game is normal, not a recap exception. Wait until ESPN marks
      // every event final before alerting Kobe about an actually unresolved row.
      if (pending.some((row) => gradingAttempts.get(row.pick_id)?.reason === 'The ESPN event is not final.')) {
        console.log(`Official recap for ${date} is waiting for the last game to become final on ESPN.`);
        return;
      }
      const pendingIds = pending.map((row) => row.pick_id).join(', ');
      const notificationId = `free-recap-pending-${date}-${pending.map((row) => row.pick_id).join('-').slice(0, 80)}`;
      const previous = state.dates?.[date] || {};
      const emailAlreadyHandled = ['QUEUED', 'ALREADY_QUEUED'].includes(previous.email_status);
      if (previous.pending_ids !== pendingIds || !emailAlreadyHandled) {
        const pendingContent = `Pending verified results: ${pendingIds}`;
        await recordRecapRun({
          operatingDate: date,
          includedPickIds: pending.map((row) => row.pick_id),
          status: 'PENDING_NOTICE_SEND_STARTED',
          recipient: recapNotificationRecipient,
          content: pendingContent,
          details: { pending_ids: pendingIds }
        });
        const emailStatus = await queueRecapNotification({
          id: notificationId,
          subject: `Kobe's Betting Hub — Daily recap waiting (${date})`,
          body: `The daily recap for ${date} is waiting for verified results for: ${pendingIds}.\n\nThe bot will retry ESPN grading and email the recap for Kobe's review once every result is settled.`
        });
        await recordRecapRun({
          operatingDate: date,
          includedPickIds: pending.map((row) => row.pick_id),
          status: `PENDING_RESULTS_${emailStatus}`,
          recipient: recapNotificationRecipient,
          content: pendingContent,
          details: { pending_ids: pendingIds }
        });
        state.dates = { ...(state.dates || {}), [date]: { ...state.dates?.[date], status: 'PENDING_RESULTS', pending_ids: pendingIds, notified_at: new Date().toISOString(), email_status: emailStatus } };
        await saveFreeRecapState(state);
      }
      console.log(`Official recap for ${date} is waiting for ${pending.length} verified result(s).`);
      return;
    }
    if (date === pacificOperatingDate() && arizonaTimeNow() < freeRecapCloseAt()) return;
    const embeds = buildLogRecapEmbeds({ date, rows });
    const capperRecap = buildCapperRecap({ date, rows, attempts: gradingAttempts });
    if (capperRecap.pending) throw new Error('Final recap blocked: unverified individual-wager results remain.');
    const content = capperRecap.body;
    const includedPickIds = picks.map((row) => row.pick_id);
    let emailStatus;
    try {
      await recordRecapRun({ operatingDate: date, includedPickIds, status: 'EMAIL_SEND_STARTED', recipient: recapNotificationRecipient, content });
      emailStatus = await queueRecapParts({
        id: `official-recap-final-${date}`,
        subject: `Kobe's Betting Hub — Daily Recap (${date})`,
        body: content
      });
    } catch (error) {
      await recordRecapRun({ operatingDate: date, includedPickIds, status: 'EMAIL_FAILED', recipient: recapNotificationRecipient, content, errorDetail: error instanceof Error ? error.message : String(error) });
      state.dates[date] = { ...(state.dates[date] || {}), status: 'EMAIL_PENDING', scope: 'official', email_status: 'FAILED' };
      await saveFreeRecapState(state);
      throw error;
    }
    await recordRecapRun({ operatingDate: date, includedPickIds, status: emailStatus, recipient: recapNotificationRecipient, content });
    state.dates[date] = { ...(state.dates[date] || {}), status: 'EMAIL_SENT', scope: 'official', emailed_at: new Date().toISOString(), email_status: emailStatus };
    await saveFreeRecapState(state);
    console.log(`Emailed automatic official-pick recap for ${date} to the configured Kobe recipient.`);
  } catch (error) {
    console.error(`Automatic free-pick recap failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    freeRecapInProgress = false;
  }
}

function startFreeRecapSchedule() {
  if (!freeRecapEnabled()) {
    console.log('Automatic daily recaps are disabled. Set FREE_RECAP_ENABLED=true to resume them.');
    return;
  }
  if (!recapEmailConfigured() && !recapWorkflow.enabled) {
    console.warn('Automatic daily recap emails are unavailable: configure the recap notification queue and Kobe recipient.');
    return;
  }
  if (!freeRecapCloseAt()) return;
  const run = () => void (async () => {
    // Send only the previous operating day's verified recap in the morning.
    await publishDueFreeRecap(previousPacificOperatingDate());
  })();
  const interval = freeRecapIntervalMs();
  freeRecapTimer = setInterval(run, interval);
  run();
    console.log(`Automatic official-pick recaps check every ${Math.round(interval / 60000)} minute(s) after ${process.env.RECAP_MORNING_REVIEW_AT || '07:00'} Arizona for the previous operating day; final delivery still waits for verified results.`);
    console.log('Private recap review and Discord approvals become eligible in the morning; no invented results or automatic public recap posts.');
    if (recapApprovalWorkflows.length) console.log('Writeup and exclusive recaps queue to separate private approval channels. Only Kobe’s exact-card approval can send to either member recap destination; pending results stay blocked.');
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
  // Trend sheets now require the same Kobe approval as every other member-
  // facing post. This intentionally replaces the old direct auto-publish path.
  if (process.env.TRENDS_AUTO_PUBLISH_ENABLED === 'true') {
    console.warn('Ignoring TRENDS_AUTO_PUBLISH_ENABLED: Trends must be approved in #pick-approvals before posting.');
  }
}

function trendsInboxPollIntervalMs() {
  const configured = Number(process.env.TRENDS_INBOX_POLL_INTERVAL_MS || 300000);
  return Number.isFinite(configured) && configured >= 60000 ? configured : 300000;
}

function trendReviewPath(id) {
  const safeId = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(reviewQueueRoot, 'trends', `${safeId}.json`);
}

function trendApprovalEmbed(draft, { preview = true } = {}) {
  const embed = {
    color: 0x2f80ed,
    title: `${String(draft.league || '').toUpperCase()} Trends`,
    description: String(draft.body || '').slice(0, 4000) || 'No trend details were supplied.',
    timestamp: draft.received_at || new Date().toISOString()
  };
  if (preview) {
    embed.title += ' — Approval Preview';
    embed.fields = [
      { name: 'From', value: 'Kobe email', inline: true },
      { name: 'Destination after approval', value: draft.destination ? `<#${draft.destination}>` : 'Not configured', inline: true },
      { name: 'Subject', value: String(draft.subject || 'No subject').slice(0, 1024) }
    ];
    embed.footer = { text: 'Private preview — nothing posts until Kobe approves.' };
  }
  return embed;
}

async function loadTrendReview(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(id || ''))) return null;
  try {
    const packetPath = trendReviewPath(id);
    return { draft: JSON.parse(await fs.readFile(packetPath, 'utf8')), packetPath };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function acknowledgeTrendDelivery(id) {
  if (!trendsInboxQueueUrl || !trendsInboxQueueSecret) return;
  const response = await auditedFetch(`${trendsInboxQueueUrl}/api/queue/trends/deliver`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${trendsInboxQueueSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }, {
    service: 'cloudflare-worker',
    endpointClass: '/api/queue/trends/deliver',
    callerComponent: 'bot/index',
    triggerType: 'trend_acknowledgement',
    workflowId: id
  });
  if (!response.ok) throw new Error(`Trend queue acknowledgement failed (${response.status}).`);
}

async function collectTrendEmails() {
  if (trendsInboxInProgress || !trendsInboxQueueUrl || !trendsInboxQueueSecret || !pickApprovalChannelId) return;
  trendsInboxInProgress = true;
  try {
    const response = await auditedFetch(`${trendsInboxQueueUrl}/api/queue/trends?limit=10`, {
      headers: { Authorization: `Bearer ${trendsInboxQueueSecret}` }
    }, {
      service: 'cloudflare-worker',
      endpointClass: '/api/queue/trends',
      callerComponent: 'bot/index',
      triggerType: 'scheduled_trend_poll'
    });
    if (!response.ok) throw new Error(`Trend inbox request failed (${response.status}).`);
    const { trends = [] } = await response.json();
    const approvalChannel = await approvedTextChannel(pickApprovalChannelId);
    for (const item of trends) {
      if (!item?.id || !['mlb', 'nfl'].includes(item.league)) continue;
      const existing = await loadTrendReview(item.id);
      if (existing) {
        await acknowledgeTrendDelivery(item.id);
        continue;
      }
      const destination = trendsChannelMap.get(item.league);
      if (!destination) {
        console.warn(`Skipping ${item.league.toUpperCase()} trend email ${item.id}: no destination in TRENDS_CHANNEL_MAP.`);
        continue;
      }
      const draft = {
        id: item.id, league: item.league, subject: item.subject, body: item.body,
        sender: item.sender, received_at: item.receivedAt, destination,
        status: 'PENDING_APPROVAL', created_at: new Date().toISOString()
      };
      const packetPath = trendReviewPath(item.id);
      await fs.mkdir(path.dirname(packetPath), { recursive: true });
      await fs.writeFile(packetPath, `${JSON.stringify(draft, null, 2)}\n`);
      try {
        await approvalChannel.send({
          embeds: [trendApprovalEmbed(draft)],
          components: [{ type: 1, components: [
            { type: 2, style: 1, label: `Post ${item.league.toUpperCase()} Trends`, custom_id: `trend-review:${item.id}:publish` },
            { type: 2, style: 4, label: 'Reject', custom_id: `trend-review:${item.id}:reject` }
          ] }]
        });
      } catch (error) {
        await fs.unlink(packetPath).catch(() => {});
        throw error;
      }
      await acknowledgeTrendDelivery(item.id);
      console.log(`Created private ${item.league.toUpperCase()} Trends approval card from Kobe email ${item.id}.`);
    }
  } catch (error) {
    console.error('Kobe Trends inbox check failed:', error);
  } finally {
    trendsInboxInProgress = false;
  }
}

function startTrendInbox() {
  if (process.env.TRENDS_INBOX_ENABLED !== 'true') {
    console.log('Kobe email Trends inbox is disabled. Set TRENDS_INBOX_ENABLED=true after its one-time setup.');
    return;
  }
  if (!trendsInboxQueueUrl || !trendsInboxQueueSecret) {
    console.warn('Kobe email Trends inbox is enabled but its queue URL or secret is missing.');
    return;
  }
  trendsInboxTimer = setInterval(() => void collectTrendEmails(), trendsInboxPollIntervalMs());
  void collectTrendEmails();
  console.log(`Kobe email Trends inbox checks every ${Math.round(trendsInboxPollIntervalMs() / 60000)} minute(s).`);
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

function xMonitorDailyAt(now = new Date()) {
  const raw = datedTimeOverride({
    now,
    overrideDate: process.env.X_MONITOR_DAILY_START_OVERRIDE_DATE,
    overrideAt: process.env.X_MONITOR_DAILY_START_OVERRIDE_AT,
    recurringAt: process.env.X_MONITOR_DAILY_AT
  });
  if (!raw) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    console.warn('Ignoring invalid X monitor daily start time. Use HH:MM in Arizona time, for example 10:00.');
    return null;
  }
  return raw;
}

function xMonitorDailyStopAt() {
  const raw = datedTimeOverride({
    overrideDate: process.env.X_MONITOR_DAILY_STOP_OVERRIDE_DATE,
    overrideAt: process.env.X_MONITOR_DAILY_STOP_OVERRIDE_AT,
    recurringAt: process.env.X_MONITOR_DAILY_STOP_AT || '15:00'
  });
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

function xMonitorModelCallLimit() {
  const raw = (process.env.X_MONITOR_MAX_MODEL_CALLS_PER_RUN || process.env.X_MONITOR_MAX_CANDIDATES || '').trim();
  if (!raw) return null;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    console.warn('Ignoring invalid X monitor model-call limit. Use a whole number of at least 1.');
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
    console.log(`X monitoring is scheduled to begin at ${new Date(firstStartAt).toISOString()} before entering the daily ${dailyAt} Arizona schedule.`);
    return;
  }
  const startAt = nextArizonaDailyStartMs(dailyAt);
  const now = new Date();
  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const currentTime = `${todayParts.find((part) => part.type === 'hour').value}:${todayParts.find((part) => part.type === 'minute').value}`;
  if (currentTime < dailyAt) {
    xMonitorDailyTimer = setTimeout(() => {
      xMonitorDailyTimer = null;
      void beginDailyXMonitor();
    }, startAt - now.getTime());
    console.log(`X monitoring is scheduled to begin at ${new Date(startAt).toISOString()} (${dailyAt} Arizona time).`);
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
  const stoppingRule = limit === null
    ? 'until the daily cutoff'
    : `until the ${limit}-pick daily free-pick limit is reached`;
  console.log(`X monitoring enabled at ${currentTime} Arizona time: checking every ${Math.round(interval / 60000)} minute(s) ${stoppingRule}.`);
  void collectXSafely();
  xMonitorIntervalTimer = setInterval(() => void collectXSafely(), interval);
  if (dailyStopAt) {
    const stopAtMs = arizonaDailyTimestampMs(dailyStopAt);
    xMonitorStopTimer = setTimeout(() => stopXMonitor(`daily cutoff of ${dailyStopAt} Arizona time reached`), Math.max(0, stopAtMs - Date.now()));
    console.log(`X monitoring is scheduled to stop at ${new Date(stopAtMs).toISOString()} each day at the configured daily cutoff.`);
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
    }

    // Collection is independent of review. New qualifying posts keep flowing
    // for the configured time window; Kobe's buttons control publication only.
    const modelCallLimit = xMonitorModelCallLimit();
    const result = await runCollector({ maxModelCalls: modelCallLimit ?? undefined });
    if (modelCallLimit !== null && result.deferred > 0) {
      console.log(`Deferred ${result.deferred} candidate(s) after using ${result.modelCalls}/${modelCallLimit} OpenAI extraction call(s); they remain eligible for the next interval.`);
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
    const modelCallLimit = xMonitorModelCallLimit();
    const stoppingRule = [
      approvedFreePickLimit !== null ? ` until ${approvedFreePickLimit} Kobe-approved free pick(s) are published` : '',
      modelCallLimit === null ? '' : ` (safety cap: ${modelCallLimit} OpenAI extraction calls per collection run)`
    ].join('');
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

async function hubStatusText() {
  const paused = await pickWorkflowPaused();
  const date = pacificOperatingDate();
  const rows = await readPickLog();
  const freeToday = freePickChannelId
    ? freePickRecapRows(rows, date, freePickChannelId).filter((row) => row.status === 'PUBLISHED').length
    : 0;
  const limit = dailyFreePickLimit();
  const pendingFree = freePickChannelId
    ? freePickRecapRows(rows, date, freePickChannelId).filter((row) => resultFor(row) === 'PENDING').length
    : 0;
  const xEnabled = process.env.X_MONITOR_ENABLED === 'true';
  const monitorState = !xEnabled ? 'off' : (xMonitorIntervalTimer ? 'running' : 'scheduled / stopped for the current window');
  const durableLog = pickLogPath().startsWith('/var/data/') ? 'configured' : 'not using /var/data';
  const emailConfigured = Boolean(recapNotificationQueueUrl && recapNotificationQueueSecret && recapNotificationRecipient);
  const auditState = auditConfigured()
    ? (process.env.AUDIT_DATABASE_REQUIRED === 'true' ? 'required and connected at startup' : 'connected; fail-closed mode is not enabled')
    : 'not configured — CSV/JSON only';
  return [
    `**Workflow:** ${paused ? 'paused — no posts can publish' : 'ready'}`,
    `**X monitor:** ${monitorState}`,
    `**Free picks today:** ${freeToday}${limit === null ? '' : ` / ${limit}`}`,
    `**Pending free results:** ${pendingFree}`,
    `**Pick log:** ${durableLog}`,
    `**Database audit:** ${auditState}`,
    `**Automatic grading:** ${process.env.AUTO_GRADE_FREE_PICKS === 'false' ? 'off' : 'on (ESPN)'}`,
    `**Automatic recap email:** ${freeRecapEnabled() && emailConfigured ? `on after ${freeRecapCloseAt()} Arizona time for every successfully published pick` : 'not configured'}`,
    `**Recap email:** ${emailConfigured ? 'connected' : 'not configured'}`
  ].join('\n');
}

function auditTimestamp(value) {
  if (!value) return 'unknown time';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function auditTimelineText(timeline) {
  if (!timeline.configured) return 'The Postgres audit ledger is not configured. This deployment cannot provide a complete pick timeline.';
  if (!timeline.found) return 'No audited source post or Pick ID matched that identifier.';
  const lines = [
    `**Source:** @${timeline.source.source_handle} — ${timeline.source.post_url || timeline.source.external_post_id}`,
    `**Posted:** ${auditTimestamp(timeline.source.posted_at)}`,
    `**Extractions:** ${timeline.extractions.length} | **Candidates:** ${timeline.candidates.length} | **Approval cards:** ${timeline.approvals.length} | **Publications:** ${timeline.publications.length}`
  ];
  for (const run of timeline.extractions.slice(-3)) {
    const usage = [run.input_tokens === null ? null : `${run.input_tokens} in`, run.image_tokens === null ? null : `${run.image_tokens} image`, run.output_tokens === null ? null : `${run.output_tokens} out`].filter(Boolean).join(', ');
    const cost = run.estimated_cost_usd === null ? '' : `, est. $${Number(run.estimated_cost_usd).toFixed(6)}`;
    lines.push(`- ${auditTimestamp(run.started_at)} — extraction ${run.status} (${run.model}${usage ? `; ${usage}` : ''}${cost})`);
  }
  for (const event of timeline.events.slice(-10)) {
    const code = event.details?.rejection_code ? ` — ${event.details.rejection_code}` : '';
    lines.push(`- ${auditTimestamp(event.occurred_at)} — ${event.event_type}${event.candidate_key ? ` [${event.candidate_key}]` : ''}${code}`);
  }
  for (const publication of timeline.publications.slice(-3)) {
    lines.push(`- ${auditTimestamp(publication.published_at || publication.created_at)} — publication ${publication.status} [${publication.pick_id}]${publication.post_reference ? ` ${publication.post_reference}` : ''}`);
  }
  for (const grade of timeline.grades.slice(-3)) {
    lines.push(`- ${auditTimestamp(grade.created_at)} — grade ${grade.status}${grade.result ? ` ${grade.result}` : ''} [${grade.pick_id}]`);
  }
  return lines.join('\n').slice(0, 1950);
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

function dailyPickOperatingDate(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function syncApprovedPickToDailyQueue(entry) {
  const publisherUrl = process.env.DAILY_PICKS_QUEUE_URL || process.env.FREE_PICK_X_PUBLISH_URL;
  const secret = process.env.DAILY_PICKS_QUEUE_SECRET;
  if (!publisherUrl || !secret) {
    console.warn('Daily Picks bridge not configured; pick was published but was not queued for the email workflow.', { pickId: entry.pick_id });
    return;
  }
  const response = await auditedFetch(`${publisherUrl.replace(/\/$/, '')}/api/queue/daily-picks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: entry.pick_id,
      operatingDate: dailyPickOperatingDate(entry.published_at || new Date().toISOString()),
      sport: entry.sport,
      event: entry.event,
      market: entry.market,
      selection: entry.selection,
      lineOdds: [entry.published_line, entry.published_odds_american].filter(Boolean).join(' '),
      units: entry.units_risked,
      reason: entry.notes || '',
      cta: 'Check the posted line and time before placing anything.',
      source: entry.source_name || 'Kobe submission',
      approvedAt: entry.approved_at || entry.published_at
    })
  }, {
    service: 'cloudflare-worker',
    endpointClass: '/api/queue/daily-picks',
    callerComponent: 'bot/index',
    triggerType: 'approved_pick_sync',
    workflowId: entry.pick_id,
    pickId: entry.pick_id
  });
  if (!response.ok) throw new Error(`Daily Picks bridge failed (${response.status}): ${await response.text()}`);
  console.log(`Daily Picks queue synced for ${entry.pick_id}.`);
}

async function postAndLogOfficialPick({ channel, payload, entry, packet = null }) {
  await recordPublicationAttempt(packet, { entry, payload });
  try {
    await appendOfficialPick(entry);
  } catch (error) {
    await recordPublicationResult(packet, { pickId: entry.pick_id, status: 'LOG_FAILED', errorDetail: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  let message;
  try {
    message = await channel.send(payload);
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    await updateOfficialPick(entry.pick_id, { status: 'POST_FAILED', notes: `Discord post failed: ${errorDetail}` });
    await recordPublicationResult(packet, { pickId: entry.pick_id, status: 'POST_FAILED', errorDetail });
    throw error;
  }

  const postReference = discordPostReference(channel, message);
  await updateOfficialPick(entry.pick_id, { post_reference: postReference, status: 'PUBLISHED' });
  try {
    await recordPublicationResult(packet, {
      pickId: entry.pick_id,
      channelId: channel.id,
      messageId: message.id,
      postReference,
      status: 'PUBLISHED'
    });
  } catch (error) {
    // The pre-publication database row is a durable outbox receipt. If the
    // final update fails after Discord accepts the post, preserve the real
    // public success and leave the PUBLISHING row available for reconciliation.
    console.error('Published pick needs audit reconciliation.', { pickId: entry.pick_id, message: error instanceof Error ? error.message : String(error) });
  }
  try {
    await syncApprovedPickToDailyQueue(entry);
  } catch (error) {
    console.error('Published pick was not synced to Daily Picks; retry is safe because the queue is idempotent.', { pickId: entry.pick_id, message: error instanceof Error ? error.message : String(error) });
  }
  if (dailyWriteupBoard && /writeups?/i.test(entry.destination || '')) {
    try {
      const receipt = await dailyWriteupBoard.refresh();
      console.log('Daily writeups board receipt:', JSON.stringify(receipt));
    } catch (error) {
      console.error('Daily writeups board needs attention:', error instanceof Error ? error.message : String(error));
    }
  }
  if (freeWriteupBoard && /writeups?/i.test(entry.destination || '')) {
    try {
      const receipt = await freeWriteupBoard.refresh();
      console.log('Free writeups preview receipt:', JSON.stringify(receipt));
    } catch (error) {
      console.error('Free writeups preview needs attention:', error instanceof Error ? error.message : String(error));
    }
  }
  if (vipExpertList && channel.id === expertPicksChannelId) {
    try {
      const receipt = await vipExpertList.refresh();
      console.log('VIP expert list receipt:', JSON.stringify(receipt));
    } catch (error) {
      console.error('VIP expert list needs attention:', error instanceof Error ? error.message : String(error));
    }
  }
  if (refreshExpertPulse && channel.id === expertPicksChannelId) {
    void refreshExpertPulse().catch((error) => console.error('VIP expert pulse needs attention:', error.message));
  }
  return message;
}

function approvalOutcomeEmbed(message, { channel, postReference, rejected = false }) {
  const prior = message?.embeds?.[0]?.toJSON?.() || {};
  const outcome = rejected
    ? '❌ **Rejected** — no member-facing post was made.'
    : `✅ **Posted to #${channel.name || channel.id}** — [View official post](${postReference})`;
  const description = [prior.description || '', '', outcome].join('\n').trim();
  return {
    ...prior,
    description: description.slice(0, 4096),
    footer: { text: rejected ? 'Kobe review completed — not published' : `Kobe approval completed — #${channel.name || channel.id}` }
  };
}

async function closeApprovalCard(interaction, outcome) {
  try {
    await interaction.message.edit({
      embeds: [approvalOutcomeEmbed(interaction.message, outcome)],
      components: []
    });
  } catch (error) {
    // The official post and canonical log remain authoritative. A cosmetic
    // receipt failure must never make a successful publication look failed.
    console.error('Could not add the approval-card receipt:', error);
    await recordDiscordPreResponseFailure({
      endpointClass: '/channels/{id}/messages/{id}',
      method: 'PATCH',
      callerComponent: 'bot/index',
      triggerType: 'approval_card_receipt',
      pickId: String(interaction.customId || '').split(':').at(-1) || null
    }, error).catch((auditError) => console.error('Unable to audit approval-card receipt failure:', auditError?.message || auditError));
  }
}

async function respondToInteractionFailure(interaction, content, context) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ ephemeral: true, content });
    }
  } catch (error) {
    // Discord interaction tokens expire. A stale button must not create an
    // unhandled rejection or restart the worker while X monitoring runs.
    const code = error?.code || error?.rawError?.code;
    await recordDiscordPreResponseFailure({
      endpointClass: '/interactions/{id}/{token}',
      method: 'POST',
      callerComponent: 'bot/index',
      triggerType: 'interaction_failure_receipt',
      pickId: String(interaction.customId || '').startsWith('source-review:')
        ? String(interaction.customId).split(':').at(-1)
        : null
    }, error).catch((auditError) => console.error('Unable to audit Discord interaction failure:', auditError?.message || auditError));
    if (code === 50027 || /Invalid Webhook Token|Unknown interaction/i.test(String(error))) {
      console.warn(`${context} could not be acknowledged because the Discord interaction token expired.`);
      return;
    }
    console.error(`${context} could not send its failure response:`, error);
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

  const response = await auditedFetch(`https://api.x.com/2/tweets/${identity.postId}?tweet.fields=created_at,attachments,entities&expansions=attachments.media_keys&media.fields=url,preview_image_url,type`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
  }, {
    service: 'x',
    endpointClass: '/2/tweets/{id}',
    callerComponent: 'bot/index',
    triggerType: 'legacy_review_recovery',
    workflowId: pickId,
    pickId
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

  // Collector-generated IDs encode their operating date and the packet file
  // uses the same ID without the trailing `-X`. Read that exact path first.
  // The fallback scan exists only for legacy/nonstandard cards. Without this
  // fast path, every button press reread every historical JSON packet on the
  // persistent disk before approval could continue.
  if (/^\d{8}-\d+-X$/.test(pickId)) {
    const date = `${pickId.slice(0, 4)}-${pickId.slice(4, 6)}-${pickId.slice(6, 8)}`;
    const packetPath = path.join(reviewQueueRoot, date, `${pickId.replace(/-X$/, '')}.json`);
    try {
      const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'));
      if (packet.pick_id === pickId) return { packet, packetPath };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

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

async function handleSourceEditButton(interaction) {
  const [, pickId] = interaction.customId.split(':');
  if (!isPickApprover(interaction)) throw new Error('Only Kobe can edit approval details.');
  const found = await findReviewPacket(pickId, interaction);
  if (!found || found.packet.approval?.decision || found.packet.discord_review_message_id !== interaction.message.id)
    throw new Error('This approval card is no longer editable.');
  if (isTermsOnlyMode(found.packet)) throw new Error('Exclusive terms have no writeup details to edit. Reject an incorrect wager.');
  const packet = found.packet;
  const details = sourceEvidence(packet).map((line) => `- ${line}`).join('\n');
  await interaction.showModal({
    custom_id: `source-edit:${pickId}:${String(packet.approval?.exact_final_copy_sha256 || 'none').slice(0, 20)}`,
    title: 'Edit writeup details',
    components: [{ type: 1, components: [{ type: 4, custom_id: 'details', label: 'Supporting facts only; one per line', style: 2,
      min_length: 20, max_length: 3000, required: true, value: details.slice(0, 3000) }] }]
  });
}

async function handleSourceEditSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!isPickApprover(interaction)) throw new Error('Only Kobe can edit approval details.');
  const match = interaction.customId.match(/^source-edit:([A-Za-z0-9_-]+):([a-f0-9]{20}|none)$/);
  if (!match) throw new Error('Invalid edit request.');
  const found = await findReviewPacket(match[1], interaction);
  if (!found || found.packet.approval?.decision || isTermsOnlyMode(found.packet)) throw new Error('This approval is no longer editable.');
  const { packet, packetPath } = found;
  if (String(packet.approval?.exact_final_copy_sha256 || 'none').slice(0, 20) !== match[2])
    throw new Error('This edit is stale. Open Edit details from the latest card.');
  const lines = interaction.fields.getTextInputValue('details').split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
  if (lines.length < 4 || lines.length > 8) throw new Error('Keep 4–8 supporting facts, one per line. No wager terms were changed.');
  const draft = { ...packet, approval: { ...packet.approval, edited_evidence: lines } };
  if (sourceEvidence(draft).length !== lines.length)
    throw new Error('One or more details are not usable supporting facts. Remove copied picks, links, and promotional text.');
  const presentation = packet.source?.reuse_permission !== 'CONFIRMED' && packet.source?.publish_mode !== 'terms_only'
    && process.env.X_SOURCE_PUBLISHING_ENABLED !== 'true' ? independentWriteupPacket(draft) : draft;
  assertCompleteWriteup(presentation);
  const copy = writeupDescription(presentation);
  if (copy.length > 4000) throw new Error('The edited writeup is too long for one card.');
  draft.approval.exact_final_copy = copy;
  draft.approval.exact_final_copy_sha256 = approvalCopySha256(copy);
  draft.status = 'READY_FOR_APPROVAL';
  draft.approval_ready = true;
  presentation.approval = { ...draft.approval };
  const channel = await interaction.client.channels.fetch(interaction.channelId);
  const message = await channel.messages.fetch(packet.discord_review_message_id);
  const components = message.components.map((row) => {
    const data = row.toJSON();
    data.components = data.components.map((button) => ({ ...button, disabled: false }));
    return data;
  });
  await message.edit({ components: [] });
  await fs.writeFile(packetPath, `${JSON.stringify(draft, null, 2)}\n`);
  await message.edit({ embeds: [buildSourcePickApprovalEmbed(presentation, 'APPROVED PICK')], components });
  await interaction.editReply('Details updated on the private card. Player, prop, line, and odds stayed locked. Review the revised card before posting.');
}

async function handleSourceReviewButton(interaction) {
  const [, pickId, action] = interaction.customId.split(':');
  const startedAt = Date.now();
  const trace = (stage) => console.log(`[approval:${pickId}] ${stage} after ${Date.now() - startedAt}ms`);
  await interaction.deferReply({ ephemeral: true });
  trace('interaction acknowledged');
  if (!isPickApprover(interaction)) {
    await interaction.editReply('Only Kobe can approve, route, or reject this source draft.');
    return;
  }
  if (!['free', 'paid', 'reject'].includes(action)) {
    await interaction.editReply('This review action is not recognized.');
    return;
  }
  const found = await findReviewPacket(pickId, interaction);
  trace('review packet loaded');
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
    const claimed = await recordApprovalAction(packet, { action: 'reject', actorId: interaction.user.id, status: 'REJECTED' });
    if (!claimed) {
      await interaction.editReply('This approval was already handled. No new action was taken.');
      return;
    }
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await closeApprovalCard(interaction, { rejected: true });
    await interaction.editReply('Rejected. No member-facing post was made.');
    return;
  }

  trace('workflow pause check started');
  if (await pickWorkflowPaused()) {
    trace('workflow paused or pause check unavailable');
    await interaction.editReply('The pick workflow is paused. No member-facing post was made.');
    return;
  }
  trace('workflow pause check passed');

  try {
    const configuredTermsOnly = packet.source?.publish_mode === 'terms_only';
    const sourcePostingEnabled = process.env.X_SOURCE_PUBLISHING_ENABLED === 'true';
    const monitoringOnly = packet.source?.reuse_permission !== 'CONFIRMED' && !configuredTermsOnly && !sourcePostingEnabled;
    const publicationPacket = monitoringOnly ? independentWriteupPacket(packet) : packet;
    const termsOnly = isTermsOnlyMode(publicationPacket);
    assertPublishableExtraction(publicationPacket);
    if (!configuredTermsOnly && !isSupportedSportPick(publicationPacket)) {
      throw new Error('Only picks explicitly identified as a supported sport can be published.');
    }
    if (!termsOnly) {
      assertCompleteWriteup(publicationPacket);
      assertApprovalCopyMatches(publicationPacket);
      if (action === 'paid') assertWriteupOdds(publicationPacket);
    }
    trace('event verification started');
    if (configuredTermsOnly && !exclusiveSourceIsCurrent(publicationPacket)) {
      throw new Error('This exclusive source is not from today. Use a current card.');
    }
    if (configuredTermsOnly && publicationPacket.verification?.event_start
      && Date.parse(publicationPacket.verification.event_start) <= Date.now()) {
      throw new Error('This verified game has already started. Use a current card.');
    }
    const timing = configuredTermsOnly ? { status: 'UPCOMING', source: 'SOURCE_TERMS_OWNER_APPROVAL' }
      : await upcomingEventStatus(publicationPacket);
    trace(`event verification ${timing.status}`);
    if (timing.status !== 'UPCOMING') {
      throw new Error(timing.status === 'STARTED_OR_FINISHED'
        ? 'This game has already started, so this card cannot be published.'
        : timing.status === 'PLAYER_NOT_ON_EVENT_TEAM'
          ? timing.reason
          : 'This pick is not verified for an upcoming game scheduled today. Reject it and use a current card.');
    }
    const sport = normalizedSport(publicationPacket);
    if (action === 'free') {
      assertFreePickEligible(publicationPacket);
      await enforceDailyFreePickLimit();
    }
    const channel = action === 'free'
      ? await approvedTextChannel(freePickChannelId)
      : await approvedTextChannel(configuredTermsOnly ? expertPicksChannelId : (sport ? sportChannelMap.get(sport) : undefined));
    const label = action === 'free' ? 'FREE PICK' : 'PAID PICK';
    const extraction = publicationPacket.analysis.extraction;
    const firstPlay = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays[0] : extraction;
    const claimed = await recordApprovalAction(publicationPacket, {
      action,
      actorId: interaction.user.id,
      status: 'APPROVED_PENDING_PUBLICATION'
    });
    if (!claimed) {
      await interaction.editReply('This approval was already handled. No duplicate post was made.');
      return;
    }
    trace('approval audit recorded');
    const publishedMessage = await postAndLogOfficialPick({
      channel,
      payload: { embeds: [buildSourcePickEmbed(publicationPacket, label)] },
      packet: publicationPacket,
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
        units_risked: firstExtractedUnits(publicationPacket),
        source_name: sourceCapperName(publicationPacket),
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
    trace('official Discord post and canonical log completed');
    approval.decision = action === 'free' ? 'FREE_PUBLISHED' : 'PAID_PUBLISHED';
    approval.destination_sport = action === 'free' ? 'free' : sport;
    packet.status = 'PUBLISHED';
    packet.approval = approval;
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    if (action === 'free') await freePickDelivery.remember(publicationPacket);
    const postReference = discordPostReference(channel, publishedMessage);
    await closeApprovalCard(interaction, { channel, postReference });
    if (action === 'free') void freePickDelivery.run().catch(() => console.error('Free Pick delivery recovery needs attention.'));
    await interaction.editReply(`Published to ${channel}. [View official post](${postReference})${action === 'free' ? ' Website/X delivery is queued with automatic recovery; the delivery receipt confirms completion.' : ''}`);
    trace('interaction completed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete this approval action.';
    console.error(`[approval:${pickId}] failed after ${Date.now() - startedAt}ms:`, message);
    await interaction.editReply(message);
  }
}

async function handleTrendReviewButton(interaction) {
  const [, id, action] = interaction.customId.split(':');
  await interaction.deferReply({ ephemeral: true });
  if (!isPickApprover(interaction)) {
    await interaction.editReply('Only Kobe can approve or reject a Trends sheet.');
    return;
  }
  if (!['publish', 'reject'].includes(action)) {
    await interaction.editReply('This Trends action is not recognized.');
    return;
  }
  const found = await loadTrendReview(id);
  if (!found) {
    await interaction.editReply('This Trends preview is no longer available. Send it from Kobe email again.');
    return;
  }
  const { draft, packetPath } = found;
  if (draft.status !== 'PENDING_APPROVAL') {
    await interaction.editReply(`This Trends sheet was already ${String(draft.status || '').toLowerCase()}.`);
    return;
  }
  if (action === 'reject') {
    draft.status = 'REJECTED';
    draft.decided_at = new Date().toISOString();
    draft.approver = interaction.user.id;
    await fs.writeFile(packetPath, `${JSON.stringify(draft, null, 2)}\n`);
    await interaction.message.edit({ components: [] });
    await interaction.editReply('Rejected. No Trends post was made.');
    return;
  }
  try {
    const channel = await approvedTextChannel(draft.destination);
    const message = await channel.send({ embeds: [trendApprovalEmbed(draft, { preview: false })] });
    draft.status = 'PUBLISHED';
    draft.decided_at = new Date().toISOString();
    draft.approver = interaction.user.id;
    draft.post_reference = discordPostReference(channel, message);
    await fs.writeFile(packetPath, `${JSON.stringify(draft, null, 2)}\n`);
    await interaction.message.edit({ components: [] });
    await interaction.editReply(`Posted ${String(draft.league).toUpperCase()} Trends to ${channel}.`);
  } catch (error) {
    await interaction.editReply(error instanceof Error ? error.message : 'Unable to publish the approved Trends sheet.');
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

async function channelLabel(channelId, fallback) {
  if (!channelId) return fallback;
  try {
    const channel = await client.channels.fetch(channelId);
    return channel?.name ? `#${channel.name}` : fallback;
  } catch {
    return fallback;
  }
}

async function refreshPendingTermsOnlyApprovals() {
  if (!exclusivePickApprovalChannelId) return;
  const directory = path.join(reviewQueueRoot, pacificClock().date);
  let files;
  try {
    files = (await fs.readdir(directory)).filter((file) => file.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const approvalChannel = await client.channels.fetch(exclusivePickApprovalChannelId);
  if (!approvalChannel?.isTextBased() || !approvalChannel.messages) return;
  const paidLabel = `Post to ${await channelLabel(expertPicksChannelId, '#expert-picks')}`;
  let refreshed = 0;
  for (const file of files) {
    let packet;
    try {
      packet = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
    } catch {
      continue;
    }
    if (
      packet.source?.publish_mode !== 'terms_only'
      || !packet.discord_review_message_id
      || packet.approval?.decision
    ) continue;
    try {
      const message = await approvalChannel.messages.fetch(packet.discord_review_message_id);
      await message.edit({
        components: reviewButtons(packet.pick_id, {
          paidOnly: true,
          paidLabel
        })
      });
      refreshed += 1;
    } catch (error) {
      console.error(`Could not refresh expert-picks approval card ${packet.pick_id}:`, error);
    }
  }
  if (refreshed) console.log(`Refreshed ${refreshed} pending approval card(s) to the expert-picks-only route.`);
}

async function refreshVisibleTermsOnlyApprovalControls() {
  if (!exclusivePickApprovalChannelId) return 0;
  const channel = await client.channels.fetch(exclusivePickApprovalChannelId);
  if (!channel?.isTextBased() || !channel.messages) return 0;
  const messages = await channel.messages.fetch({ limit: 100 });
  let refreshed = 0;
  for (const message of messages.values()) {
    const components = expertOnlyButtonsFromMessage(message.components);
    if (!components || message.components?.[0]?.components?.length === 2) continue;
    await message.edit({ components });
    refreshed += 1;
  }
  console.log(`Expert-picks approval control receipt: ${JSON.stringify({ scanned: messages.size, refreshed })}`);
  return refreshed;
}

async function refreshPendingDetailEditControls() {
  if (!pickApprovalChannelId) return 0;
  const channel = await approvedTextChannel(pickApprovalChannelId);
  const messages = await channel.messages.fetch({ limit: 100 });
  let refreshed = 0;
  for (const message of messages.values()) {
    if (message.author?.id !== client.user.id || message.components.length !== 1) continue;
    const row = message.components[0].toJSON();
    const buttons = row.components || [];
    const ids = buttons.map((button) => button.custom_id || '');
    const pickId = ids.find((id) => /^source-review:[A-Za-z0-9_-]+:paid$/.test(id))?.split(':')[1];
    const paid = buttons.find((button) => button.custom_id === `source-review:${pickId}:paid`);
    if (!pickId || !paid || !ids.includes(`source-review:${pickId}:free`)
      || !ids.includes(`source-review:${pickId}:reject`) || ids.includes(`source-review:${pickId}:edit`)) continue;
    buttons.splice(buttons.length - 1, 0, { type: 2, style: 2, label: 'Edit details',
      custom_id: `source-review:${pickId}:edit`, disabled: Boolean(paid.disabled) });
    await message.edit({ components: [row] });
    refreshed++;
  }
  return refreshed;
}

async function refreshPendingResearchApprovals() {
  if (!pickApprovalChannelId) return;
  const date = pacificClock().date;
  const directory = path.join(reviewQueueRoot, date);
  let files;
  try {
    files = (await fs.readdir(directory)).filter((file) => file.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const approvalChannel = await client.channels.fetch(pickApprovalChannelId);
  if (!approvalChannel?.isTextBased() || !approvalChannel.messages) return;
  let refreshed = 0;
  for (const file of files) {
    const packetPath = path.join(directory, file);
    let packet;
    try {
      packet = JSON.parse(await fs.readFile(packetPath, 'utf8'));
    } catch {
      continue;
    }
    const monitoringOnly = packet.source?.reuse_permission !== 'CONFIRMED'
      && packet.source?.publish_mode !== 'terms_only'
      && process.env.X_SOURCE_PUBLISHING_ENABLED !== 'true';
    if (!monitoringOnly || !packet.discord_review_message_id || packet.approval?.decision) continue;
    const research = await fillMissingEvidence(packet);
    if (!research.complete) {
      console.log(`Could not refresh ${packet.pick_id} into the locked writeup format: ${research.reason || 'insufficient verified evidence'}.`);
      // A legacy split card may still display inherited evidence. Replace its
      // stale copy and disable publishing rather than leave unsafe buttons live.
      try {
        packet.approval ||= {};
        delete packet.approval.exact_final_copy;
        delete packet.approval.exact_final_copy_sha256;
        const presentationPacket = independentWriteupPacket(packet);
        const message = await approvalChannel.messages.fetch(packet.discord_review_message_id);
        await message.edit({
          embeds: [buildSourcePickApprovalEmbed(presentationPacket, 'APPROVED PICK')],
          components: reviewButtons(packet.pick_id, { testOnly: true, freeLabel: 'Verified research needed', paidLabel: 'Verified research needed' })
        });
        packet.status = 'RESEARCH_REQUIRED';
        packet.approval_ready = false;
        await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
        await recordWorkflowEvent(packet, { eventType: 'APPROVAL_CARD_RESEARCH_HELD', beforeState: 'PENDING_APPROVAL', afterState: 'RESEARCH_REQUIRED', details: { reason: research.reason || 'insufficient verified evidence' } });
      } catch (error) {
        console.error(`Could not hold unsafe approval card ${packet.pick_id}:`, error);
      }
      continue;
    }
    const presentationPacket = independentWriteupPacket(packet);
    const exactFinalCopy = writeupDescription(presentationPacket);
    packet.approval = {
      ...(packet.approval || {}),
      exact_final_copy: exactFinalCopy,
      exact_final_copy_sha256: approvalCopySha256(exactFinalCopy)
    };
    presentationPacket.approval = { ...packet.approval };
    const sport = normalizedSport(packet);
    const paidChannelId = sport ? sportChannelMap.get(sport) : undefined;
    const labels = {
      freeLabel: `Post to ${await channelLabel(freePickChannelId, '#daily-free-play')}`,
      paidLabel: `Post to ${await channelLabel(paidChannelId, '#paid-sport')}`
    };
    try {
      const message = await approvalChannel.messages.fetch(packet.discord_review_message_id);
      await message.edit({
        embeds: [buildSourcePickApprovalEmbed(presentationPacket, 'APPROVED PICK')],
        components: reviewButtons(packet.pick_id, labels)
      });
      packet.status = 'READY_FOR_APPROVAL';
      packet.approval_ready = true;
      await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
      await recordWorkflowEvent(packet, {
        eventType: 'APPROVAL_CARD_RESEARCH_REFRESHED',
        beforeState: 'PENDING_APPROVAL',
        afterState: 'PENDING_APPROVAL',
        details: { evidence_count: sourceEvidence(presentationPacket).length, espn_calls: research.espnCalls }
      });
      refreshed += 1;
    } catch (error) {
      console.error(`Could not edit approval card ${packet.pick_id}:`, error);
    }
  }
  if (refreshed) console.log(`Refreshed ${refreshed} pending approval card(s) into the locked evidence format.`);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  // Independent boards/readers must not wait behind historical card research.
  startInjuryReports();
  startTelegramReader();
  startXMonitor();
  startTrendsSchedule();
  startTrendInbox();
  startFreeRecapSchedule();
  startFreePickDelivery();
  startFreePickResultsSync();
  if (process.env.PRIVATE_EXCLUSIVE_IMPORT_FILE && process.env.PRIVATE_EXCLUSIVE_IMPORT_DATE) {
    void import('../scripts/import-manual-exclusives.mjs')
      .then(({ runManualExclusiveImport }) => runManualExclusiveImport({
        file: path.resolve(process.env.PRIVATE_EXCLUSIVE_IMPORT_FILE),
        date: process.env.PRIVATE_EXCLUSIVE_IMPORT_DATE,
        send: true
      }))
      .then(receipt => console.log('Private exclusive recovery import receipt:', JSON.stringify(receipt)))
      .catch(error => console.error('Private exclusive recovery import needs attention:', error.message));
  }
  try {
    const referralReceipt = await ensureReferralInfoCard();
    console.log('Referral information card receipt:', JSON.stringify(referralReceipt));
  } catch (error) {
    console.error('Referral information card needs attention:', error.message);
  }
  if (dailyWriteupBoard) {
    void dailyWriteupBoard.refresh()
      .then(receipt => console.log('Daily writeups board receipt:', JSON.stringify(receipt)))
      .catch(error => console.error('Daily writeups board needs attention:', error.message));
    setInterval(() => void dailyWriteupBoard.refresh().catch(error => console.error('Daily writeups board needs attention:', error.message)), 60000);
  }
  try {
    const channel = await ensureFreeWriteupsChannel();
    let lastSitePreview = '';
    freeWriteupBoard = createFreeWriteupBoard({
      channelFor: () => Promise.resolve(channel),
      rowsFor: allWriteupRows,
      stateFile: path.join(path.dirname(pickLogPath()), 'free-writeups-board.json'),
      operatingDate: () => dailyPickOperatingDate(new Date()),
      syncSite: async (board) => {
        const secret = process.env.FREE_PICK_SITE_PUBLISH_SECRET;
        if (!secret) return;
        const serialized = JSON.stringify(board);
        if (serialized === lastSitePreview) return;
        const origin = (process.env.FREE_PICK_SITE_PUBLISH_URL || 'https://bettinghub-publisher.kobedirwin.workers.dev').replace(/\/$/, '');
        const response = await fetch(`${origin}/api/vip-preview/current`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
          body: serialized,
          signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) console.error('VIP preview website sync needs attention:', response.status);
        else lastSitePreview = serialized;
      }
    });
    const receipt = await freeWriteupBoard.refresh();
    console.log('Free writeups preview receipt:', JSON.stringify({ ...receipt, channelId: channel.id }));
    setInterval(() => void freeWriteupBoard.refresh().catch(error => console.error('Free writeups preview needs attention:', error.message)), 60000);
  } catch (error) {
    console.error('Free writeups preview setup needs attention:', error.message);
  }
  if (vipExpertList) {
    void vipExpertList.refresh()
      .then((receipt) => console.log('VIP expert list receipt:', JSON.stringify(receipt)))
      .catch((error) => console.error('VIP expert list needs attention:', error.message));
    setInterval(() => void vipExpertList.refresh()
      .then((receipt) => { if (receipt.status !== 'UNCHANGED') console.log('VIP expert list receipt:', JSON.stringify(receipt)); })
      .catch((error) => console.error('VIP expert list needs attention:', error.message)), 300000);
  }
  if (refreshExpertPulse) {
    void refreshExpertPulse()
      .then((receipt) => console.log('VIP expert pulse receipt:', JSON.stringify(receipt)))
      .catch((error) => console.error('VIP expert pulse needs attention:', error.message));
    setInterval(() => void refreshExpertPulse()
      .then((receipt) => { if (receipt.status !== 'UNCHANGED') console.log('VIP expert pulse receipt:', JSON.stringify(receipt)); })
      .catch((error) => console.error('VIP expert pulse needs attention:', error.message)), 300000);
  }
  try {
    await refreshPendingTermsOnlyApprovals();
    await refreshVisibleTermsOnlyApprovalControls();
  } catch (error) {
    console.error('Unable to refresh pending expert-picks approval cards:', error);
  }
  try {
    await refreshPendingResearchApprovals();
    await refreshPendingDetailEditControls();
  } catch (error) {
    console.error('Unable to refresh pending approval research:', error);
  }
  // The scheduled recap may already have run before a deploy. Refresh
  // yesterday's still-pending cards now so Kobe sees the current controls.
  void queueDiscordRecapApprovals(previousPacificOperatingDate())
    .catch((error) => console.error('Unable to refresh pending recap approval controls:', error));
});

async function registerCommandsOnStart() {
  if (process.env.AUTO_REGISTER_COMMANDS !== 'true') return;
  if (!process.env.DISCORD_APPLICATION_ID) {
    throw new Error('DISCORD_APPLICATION_ID is required when AUTO_REGISTER_COMMANDS=true.');
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const restAudit = attachDiscordRestAudit(rest, {
    callerComponent: 'bot/index',
    triggerType: 'command_registration'
  });
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID);
  try {
    await rest.put(route, { body: commands });
  } finally {
    await restAudit.flush();
    restAudit.detach();
  }
  console.log(process.env.DISCORD_GUILD_ID ? 'Registered guild commands on startup.' : 'Registered global commands on startup.');
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('expert-pulse:')) {
    try {
      await interaction.deferReply({ ephemeral: true });
      if (!expertPulse) throw new Error('Expert pulse review and VIP channels are not configured.');
      const result = await expertPulse.decide({ customId: interaction.customId,
        userId: interaction.user.id, ownerId: interaction.guild?.ownerId,
        guildId: interaction.guildId, channelId: interaction.channelId, messageId: interaction.message.id });
      await interaction.editReply(result.status === 'PUBLISHED' ? 'Approved pulse posted to the private VIP channel.'
        : result.status === 'REJECTED' ? 'Pulse rejected; nothing was posted to VIP.'
        : 'Review card refreshed. Approve the current snapshot when ready.');
    } catch (error) {
      await respondToInteractionFailure(interaction, error.message || 'Expert pulse review needs attention.', 'Expert pulse interaction');
    }
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('source-edit:')) {
    try { await handleSourceEditSubmit(interaction); }
    catch (error) { await respondToInteractionFailure(interaction, error.message || 'Could not edit this pick.', 'Pick edit interaction'); }
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('recap-edit:')) {
    try {
      await interaction.deferReply({ ephemeral: true });
      const match = interaction.customId.match(/^recap-edit:([a-z0-9_-]+):([a-f0-9]{20}):([a-f0-9]{20})$/);
      const workflow = recapApprovalWorkflows.find((entry) => entry.config.workflow_id === match?.[1]);
      if (!workflow) throw new Error('Unknown recap edit workflow.');
      await workflow.engine.editNote({ key: match[2], digest: match[3], note: interaction.fields.getTextInputValue('note'),
        userId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId });
      await interaction.editReply('Recap note updated. All original wagers and verified results remain locked; review the revised card before posting.');
    } catch (error) { await respondToInteractionFailure(interaction, error.message || 'Could not edit this recap.', 'Recap edit interaction'); }
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('recap-review:')) {
    try {
      if (/^recap-review:[a-z0-9_-]+:edit:/.test(interaction.customId)) {
        const workflowId = interaction.customId.split(':')[1];
        const workflow = recapApprovalWorkflows.find((entry) => entry.config.workflow_id === workflowId);
        if (!workflow) throw new Error('This recap workflow is not configured.');
        const draft = await workflow.engine.beginEdit({ customId: interaction.customId, userId: interaction.user.id,
          guildId: interaction.guildId, channelId: interaction.channelId, messageId: interaction.message.id });
        await interaction.showModal({ custom_id: `recap-edit:${workflowId}:${draft.key}:${draft.digest}`, title: 'Edit recap note',
          components: [{ type: 1, components: [{ type: 4, custom_id: 'note', label: 'Optional context; results stay locked',
            style: 2, max_length: 500, required: false, value: draft.note }] }] });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const workflowId = interaction.customId.match(/^recap-review:([a-z0-9_-]+):(?:approve|reject):/)?.[1] || 'exclusive';
      const workflow = recapApprovalWorkflows.find((entry) => entry.config.workflow_id === workflowId);
      if (!workflow) throw new Error('This recap approval workflow is not configured.');
      const result = await workflow.engine.decide({ customId: interaction.customId, userId: interaction.user.id,
        guildId: interaction.guildId, channelId: interaction.channelId, messageId: interaction.message.id });
      await interaction.editReply(result.status === 'REJECTED' ? 'Recap rejected. Nothing was sent to members.'
        : result.status === 'ALREADY_PUBLISHED' ? 'This recap was already posted. No duplicate was sent.'
        : `Approved recap sent to <#${workflow.config.destination_channel_id}>.`);
    } catch (error) {
      console.error('Recap approval action needs attention:', error.message);
      await respondToInteractionFailure(interaction, error.message || 'Recap action needs attention. Check the card receipts before retrying.', 'Recap review interaction');
    }
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('trend-review:')) {
    try {
      await handleTrendReviewButton(interaction);
    } catch (error) {
      console.error(error);
      await respondToInteractionFailure(interaction, 'Unable to complete this Trends action. No public post was made.', 'Trends interaction');
    }
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith('source-review:')) {
    try {
      if (interaction.customId.endsWith(':edit')) await handleSourceEditButton(interaction);
      else await handleSourceReviewButton(interaction);
    } catch (error) {
      console.error(error);
      await respondToInteractionFailure(interaction, 'Unable to complete this review action. No member-facing post was made.', 'Pick review interaction');
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
      await respondToInteractionFailure(interaction, 'I could not send the welcome right now. Please try the button again in a moment.', 'Welcome interaction');
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

  if (interaction.commandName === 'hub-status') {
    if (!isPickApprover(interaction) && !isAdministrator(interaction)) {
      await interaction.reply({ ephemeral: true, content: 'Only Kobe or a server administrator can view bot status.' });
      return;
    }
    try {
      await interaction.reply({ ephemeral: true, content: await hubStatusText() });
    } catch (error) {
      console.error('Unable to build hub status:', error);
      await interaction.reply({ ephemeral: true, content: 'Unable to read current bot status. Check the Render logs before publishing.' });
    }
    return;
  }

  if (interaction.commandName === 'pick-audit') {
    if (!isPickApprover(interaction) && !isAdministrator(interaction)) {
      await interaction.reply({ ephemeral: true, content: 'Only Kobe or a server administrator can inspect the pick audit ledger.' });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const timeline = await readAuditTimeline(interaction.options.getString('identifier', true));
      await interaction.editReply(auditTimelineText(timeline));
    } catch (error) {
      console.error('Unable to read pick audit timeline:', error);
      await interaction.editReply('The database audit timeline could not be read. Check the database connection before relying on this workflow.');
    }
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

  if (interaction.commandName === 'publish-recap' && !isPickApprover(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'Only Kobe can publish a recap after reviewing the emailed results.' });
    return;
  }

  if (interaction.commandName === 'publish-pick' && await pickWorkflowPaused()) {
    await interaction.reply({ ephemeral: true, content: 'The pick workflow is paused. No member-facing post was made.' });
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
      await recordGradeAttempt({
        pickId,
        result: null,
        status: 'STARTED',
        provider: 'manual',
        sourceReference: source,
        actorType: 'discord_user',
        actorId: interaction.user.id
      });
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
      await recordGradeAttempt({
        pickId,
        result,
        status: result === 'PENDING' ? 'PENDING' : 'GRADED',
        provider: 'manual',
        sourceReference: source,
        snapshot: { outcome },
        actorType: 'discord_user',
        actorId: interaction.user.id
      });
      await interaction.reply({
        ephemeral: true,
        content: `${updated.pick_id} recorded as ${result}. Its recap net units will be calculated from the exact published odds and units risked.`
      });
      return;
    }

    const isRecap = interaction.commandName === 'preview-recap' || interaction.commandName === 'publish-recap';
    const attachment = interaction.options.getAttachment('image');
    if (isRecap) {
      await interaction.deferReply({ ephemeral: true });
      const date = interaction.options.getString('date', true);
      const workflowGroups = await Promise.all(recapApprovalWorkflows.map(async (workflow) => ({
        workflow, groups: await cachedRecapGroups(date, workflow.config)
      })));
      if (!workflowGroups.some((entry) => entry.groups.length)) throw new Error('No published writeup or exclusive wagers were found for that date.');
      if (interaction.commandName === 'preview-recap') {
        await interaction.editReply({ content: 'Private capper-format preview; unresolved results are not eligible for posting.',
          files: [{ attachment: Buffer.from(workflowGroups.filter((entry) => entry.groups.length)
            .map((entry) => `${entry.workflow.label.toUpperCase()} RECAPS\n\n${entry.groups.map((group) => group.body).join('\n\n')}`).join('\n\n')), name: 'recap-preview.txt' }] });
        return;
      }
      // This command queues review only. No path bypasses the exact-card button approval.
      for (const entry of workflowGroups) if (entry.groups.length) await entry.workflow.engine.prepare(entry.groups);
      const channels = workflowGroups.filter((entry) => entry.groups.length)
        .map((entry) => `<#${entry.workflow.config.review_channel_id}>`).join(' and ');
      await interaction.editReply(`Recap approval cards are ready in ${channels}. Kobe must approve each card before it reaches its member recap channel. Optional images/custom channels are not used by this verified recap flow.`);
      return;
    }

    const pickOptions = optionsFrom(interaction);
    if (!isSupportedSportPick({ analysis: { extraction: { sport: pickOptions.sport, league: pickOptions.league } } })) {
      throw new Error('Only supported major-sport picks can be published. Set a supported sport and league.');
    }
    const pickId = makePickId({ sport: pickOptions.sport, pickNumber: pickOptions.pickNumber });
    const embed = buildPickEmbed({ ...pickOptions, pickId });
    if (interaction.commandName === 'preview-pick') {
      await interaction.reply({ ephemeral: true, embeds: [embed] });
      return;
    }

    const manualPacket = {
      analysis: { extraction: {
        sport: pickOptions.sport,
        league: pickOptions.league,
        event: pickOptions.event
      } }
    };
    const timing = await upcomingEventStatus(manualPacket);
    if (timing.status !== 'UPCOMING') {
      throw new Error('This pick was not verified as an upcoming supported-sport game scheduled today. No post was made.');
    }

    const channel = await destinationFor(interaction, defaultChannelId, pickOptions.sport.toLowerCase());
    if (/writeups?/i.test(channel.name || '') && !nearEvenAmericanOdds(pickOptions.publishedOdds)) {
      throw new Error('VIP writeups require actual published odds between -125 and +125. Choose a different play; do not alter its odds.');
    }
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
    if (channel.id === freePickChannelId) {
      await freePickDelivery.remember({
        ...canonicalFreePacket({ pick_id: pickId, sport: pickOptions.sport, league: pickOptions.league,
          event: pickOptions.event, selection: pickOptions.pick, published_line: String(pickOptions.publishedLine),
          published_odds_american: String(pickOptions.publishedOdds), units_risked: String(pickOptions.unitsRisked) }),
        analysis: { extraction: {
          sport: pickOptions.sport, league: pickOptions.league, event: pickOptions.event,
          selection: pickOptions.pick, line: String(pickOptions.publishedLine),
          odds_american: String(pickOptions.publishedOdds), units: String(pickOptions.unitsRisked),
          source_claims: pickOptions.evidence.split(/\n/).map((line) => line.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean)
        } }
      });
      void freePickDelivery.run().catch(() => console.error('Manual Free Pick delivery recovery needs attention.'));
    }
    await interaction.reply({ ephemeral: true, content: `Published to ${channel}.${channel.id === freePickChannelId ? ' Website/X delivery queued with automatic recovery.' : ''}` });
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
  await initializeAuditStore();
  await registerCommandsOnStart();
  await client.login(process.env.DISCORD_TOKEN);
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Cloud worker stopping; durable delivery receipts are retained.');
  for (const timer of [xMonitorIntervalTimer, xMonitorStopTimer, xMonitorDailyTimer,
    trendsTimer, trendsInboxTimer, freeRecapTimer, freePickDeliveryTimer, injuryTimer,
    telegramTimer, telegramStopTimer, telegramDailyTimer]) {
    if (timer) clearTimeout(timer);
  }
  // Leave enough time for Discord receipt writes before Render's forced stop.
  const deadline = setTimeout(() => process.exit(0), 25000);
  try { await Promise.all([injuryDelivery?.stop(), telegramReader?.stop(), ...recapApprovalWorkflows.map((workflow) => workflow.engine.stop())]); }
  catch { console.error('Cloud drain interrupted; uncertain sends will be reconciled on restart.'); }
  while (xCollectionInProgress || trendsPublicationInProgress || trendsInboxInProgress || freeRecapInProgress) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  client.destroy();
  await closeAuditStore().catch(() => {});
  clearTimeout(deadline);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Exported for integration checks without logging the bot in.
module.exports = { commands };
