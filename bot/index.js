require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { buildPickEmbed, listFromEnv } = require('./lib/pick');
const { buildLogRecapEmbeds, isPublishedRow, recapRows } = require('./lib/recap');
const { freePickRecapRows } = require('./lib/free-recap');
const { gradePickFromEspn } = require('./lib/espn-grading');
const { appendOfficialPick, makePickId, netUnitsFor, pacificOperatingDate, pickLogPath, readPickLog, resultFor, updateOfficialPick } = require('./lib/pick-log');
const { WELCOME_BUTTON_ID, buildWelcomeInvite, buildWelcomeDm } = require('./lib/welcome');
const { assertFreePickEligible, assertPublishableExtraction, buildSourcePickEmbed, sourceCapperName } = require('./lib/source-review');
const { syncApprovedFreePickToX } = require('./lib/free-pick-x');
const { publishApprovedFreePickToSite } = require('./lib/free-pick-site');
const { reviewQueuePath } = require('./lib/review-queue-path');
const { isNFLPick, upcomingEventStatus } = require('./lib/event-timing');
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
const freeRecapChannelId = process.env.FREE_RECAP_CHANNEL_ID || recapChannelId;
const freeRecapStatePath = path.join(path.dirname(pickLogPath()), 'free-recap-state.json');
// The approved #exclusives destination is kept configurable for future moves.
// The fallback preserves the currently approved server destination when an
// older Render environment has not yet added the variable.
const exclusivesChannelId = process.env.EXCLUSIVES_CHANNEL_ID || '1539055850075852911';
const pickApprovalChannelId = process.env.PICK_APPROVAL_CHANNEL_ID;
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
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const welcomedMemberIds = new Set();
let xCollectionInProgress = false;
let xMonitorCreated = 0;
let xMonitorIntervalTimer = null;
let xMonitorStopTimer = null;
let xMonitorDailyTimer = null;
let trendsTimer = null;
let trendsPublicationInProgress = false;
let trendsInboxTimer = null;
let trendsInboxInProgress = false;
let freeRecapTimer = null;
let freeRecapInProgress = false;

// A shared kill switch for new public pick posts. The collector has its own
// matching check, while this one protects existing Discord approval cards and
// manual /publish-pick posts during a pause.
async function pickWorkflowPaused() {
  try {
    const setting = JSON.parse(await fs.readFile(pickWorkflowPath, 'utf8'));
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
  const response = await fetch(`${recapNotificationQueueUrl}/api/queue/recap-notifications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${recapNotificationQueueSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, recipient: recapNotificationRecipient, subject, body })
  });
  if (response.status === 409) return 'ALREADY_QUEUED';
  if (!response.ok) throw new Error(`Recap email queue returned ${response.status}.`);
  return 'QUEUED';
}

async function autoGradePendingOfficialPicks(date) {
  const attempts = new Map();
  if (process.env.AUTO_GRADE_FREE_PICKS === 'false') return attempts;
  const rows = await readPickLog();
  const pending = rows.filter((row) => (
    row.operating_date === date
    && isPublishedRow(row)
    && resultFor(row) === 'PENDING'
  ));
  for (const row of pending) {
    const grade = await gradePickFromEspn(row);
    attempts.set(row.pick_id, grade);
    if (grade.status !== 'GRADED') {
      console.log(`Automatic grading kept ${row.pick_id} pending: ${grade.reason || 'not enough verified ESPN data'}.`);
      continue;
    }
    const updated = await updateOfficialPick(row.pick_id, {
      result: grade.result,
      status: 'GRADED',
      score_or_outcome: grade.outcome,
      result_verified_source: `ESPN final box score: ${grade.source}`,
      result_verified_at: new Date().toISOString(),
      graded_by: 'auto:espn'
    });
    const net = netUnitsFor(updated);
    if (net !== null) await updateOfficialPick(row.pick_id, { net_units: net });
    console.log(`Automatically graded ${row.pick_id} as ${grade.result} from ESPN.`);
  }
  return attempts;
}

function recapEmailBody(embeds) {
  return embeds.map((embed) => embed.description || '').filter(Boolean).join('\n\n');
}

async function publishDueFreeRecap(date) {
  if (freeRecapInProgress || !recapEmailConfigured()) return;
  freeRecapInProgress = true;
  try {
    const state = await readFreeRecapState();
    const prior = state.dates?.[date];
    if (prior?.status === 'EMAIL_SENT') return;
    if (prior?.status === 'PUBLISHED') {
      // A recap can be posted before the optional email queue is configured. Once
      // configured, catch that one up without reposting the Discord recap.
      const emailAlreadyHandled = ['QUEUED', 'ALREADY_QUEUED'].includes(prior.email_status);
      if (!emailAlreadyHandled) {
        const rows = await readPickLog();
        const embeds = buildLogRecapEmbeds({ date, rows });
        const emailStatus = await queueRecapNotification({
          id: `official-recap-final-${date}`,
          subject: `Kobe's Betting Hub — Daily Recap (${date})`,
          body: recapEmailBody(embeds).replaceAll('**', '')
        });
        state.dates[date] = { ...prior, email_status: emailStatus, email_queued_at: new Date().toISOString() };
        await saveFreeRecapState(state);
      }
      return;
    }
    let rows = await readPickLog();
    let picks = rows.filter((row) => (
      row.operating_date === date
      && isPublishedRow(row)
    ));
    if (!picks.length) {
      console.log(`No successfully published official picks were logged for ${date}; no recap was posted.`);
      return;
    }
    const gradingAttempts = await autoGradePendingOfficialPicks(date);
    rows = await readPickLog();
    picks = recapRows(rows, date);
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
        const emailStatus = await queueRecapNotification({
          id: notificationId,
          subject: `Kobe's Betting Hub — Daily recap waiting (${date})`,
          body: `The daily recap for ${date} is waiting for verified results for: ${pendingIds}.\n\nThe bot will retry ESPN grading and post the recap automatically once every result is settled.`
        });
        state.dates = { ...(state.dates || {}), [date]: { status: 'PENDING_RESULTS', pending_ids: pendingIds, notified_at: new Date().toISOString(), email_status: emailStatus } };
        await saveFreeRecapState(state);
      }
      console.log(`Official recap for ${date} is waiting for ${pending.length} verified result(s).`);
      return;
    }
    const embeds = buildLogRecapEmbeds({ date, rows });
    let emailStatus;
    try {
      emailStatus = await queueRecapNotification({
        id: `official-recap-final-${date}`,
        subject: `Kobe's Betting Hub — Daily Recap (${date})`,
        body: recapEmailBody(embeds).replaceAll('**', '')
      });
    } catch (error) {
      state.dates[date] = { ...(state.dates[date] || {}), status: 'EMAIL_PENDING', scope: 'official', email_status: 'FAILED' };
      await saveFreeRecapState(state);
      throw error;
    }
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
  if (!recapEmailConfigured()) {
    console.warn('Automatic daily recap emails are unavailable: configure the recap notification queue and Kobe recipient.');
    return;
  }
  if (!freeRecapCloseAt()) return;
  const run = () => void (async () => {
    // Yesterday remains eligible for a late ESPN correction; today emails Kobe
    // as soon as its pick window has closed and the final game settles.
    await publishDueFreeRecap(previousPacificOperatingDate());
    await publishDueFreeRecap(pacificOperatingDate());
  })();
  const interval = freeRecapIntervalMs();
  freeRecapTimer = setInterval(run, interval);
  run();
    console.log(`Automatic official-pick recap emails check every ${Math.round(interval / 60000)} minute(s), after the ${freeRecapCloseAt()} Arizona pick window closes, and email once every result is graded.`);
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
  const response = await fetch(`${trendsInboxQueueUrl}/api/queue/trends/deliver`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${trendsInboxQueueSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  if (!response.ok) throw new Error(`Trend queue acknowledgement failed (${response.status}).`);
}

async function collectTrendEmails() {
  if (trendsInboxInProgress || !trendsInboxQueueUrl || !trendsInboxQueueSecret || !pickApprovalChannelId) return;
  trendsInboxInProgress = true;
  try {
    const response = await fetch(`${trendsInboxQueueUrl}/api/queue/trends?limit=10`, {
      headers: { Authorization: `Bearer ${trendsInboxQueueSecret}` }
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
  const overrideDate = (process.env.X_MONITOR_DAILY_STOP_OVERRIDE_DATE || '').trim();
  const overrideAt = (process.env.X_MONITOR_DAILY_STOP_OVERRIDE_AT || '').trim();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const raw = overrideDate === today && overrideAt
    ? overrideAt
    : (process.env.X_MONITOR_DAILY_STOP_AT || '15:00').trim();
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
  // Each daily window is a new search session. Reset yesterday's private-card
  // count so reaching its cap cannot stop today's monitor at startup.
  xMonitorCreated = 0;
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
    const stoppingRule = [
      approvedFreePickLimit !== null ? ` until ${approvedFreePickLimit} Kobe-approved free pick(s) are published` : '',
      limit === null ? '' : ` (safety cap: ${limit} approval cards)`
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
  return [
    `**Workflow:** ${paused ? 'paused — no posts can publish' : 'ready'}`,
    `**X monitor:** ${monitorState}`,
    `**Free picks today:** ${freeToday}${limit === null ? '' : ` / ${limit}`}`,
    `**Pending free results:** ${pendingFree}`,
    `**Pick log:** ${durableLog}`,
    `**Automatic grading:** ${process.env.AUTO_GRADE_FREE_PICKS === 'false' ? 'off' : 'on (ESPN)'}`,
    `**Automatic recap email:** ${freeRecapEnabled() && emailConfigured ? `on after ${freeRecapCloseAt()} Arizona time for every successfully published pick` : 'not configured'}`,
    `**Recap email:** ${emailConfigured ? 'connected' : 'not configured'}`
  ].join('\n');
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
  const response = await fetch(`${publisherUrl.replace(/\/$/, '')}/api/queue/daily-picks`, {
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
  });
  if (!response.ok) throw new Error(`Daily Picks bridge failed (${response.status}): ${await response.text()}`);
  console.log(`Daily Picks queue synced for ${entry.pick_id}.`);
}

async function postAndLogOfficialPick({ channel, payload, entry }) {
  await appendOfficialPick(entry);
  try {
    const message = await channel.send(payload);
    await updateOfficialPick(entry.pick_id, {
      post_reference: discordPostReference(channel, message),
      status: 'PUBLISHED'
    });
    try {
      await syncApprovedPickToDailyQueue(entry);
    } catch (error) {
      console.error('Published pick was not synced to Daily Picks; retry is safe because the queue is idempotent.', { pickId: entry.pick_id, message: error instanceof Error ? error.message : String(error) });
    }
    return message;
  } catch (error) {
    await updateOfficialPick(entry.pick_id, {
      status: 'POST_FAILED',
      notes: `Discord post failed: ${error instanceof Error ? error.message : String(error)}`
    });
    throw error;
  }
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
    await closeApprovalCard(interaction, { rejected: true });
    await interaction.editReply('Rejected. No member-facing post was made.');
    return;
  }

  if (await pickWorkflowPaused()) {
    await interaction.editReply('The pick workflow is paused. No member-facing post was made.');
    return;
  }

  try {
    const termsOnly = packet.source?.publish_mode === 'terms_only';
    const sourcePostingEnabled = process.env.X_SOURCE_PUBLISHING_ENABLED === 'true';
    if (packet.source?.reuse_permission !== 'CONFIRMED' && !termsOnly && !sourcePostingEnabled) {
      throw new Error('This source is approved for monitoring only. Use Kobe’s original wording and approved media with /publish-pick until source reuse permission is confirmed.');
    }
    assertPublishableExtraction(packet);
    if (!isNFLPick(packet)) {
      throw new Error('Only picks explicitly identified as NFL/football picks can be published.');
    }
    const timing = await upcomingEventStatus(packet);
    if (timing.status !== 'UPCOMING') {
      throw new Error(timing.status === 'STARTED_OR_FINISHED'
        ? 'This game has already started, so this card cannot be published.'
        : timing.status === 'PLAYER_NOT_ON_EVENT_TEAM'
          ? timing.reason
          : 'This pick is not verified for an upcoming game scheduled today. Reject it and use a current card.');
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
    const publishedMessage = await postAndLogOfficialPick({
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
    const postReference = discordPostReference(channel, publishedMessage);
    await closeApprovalCard(interaction, { channel, postReference });
    let siteNote = '';
    if (action === 'free') {
      try {
        const siteSync = await publishApprovedFreePickToSite(packet);
        siteNote = siteSync.status === 'disabled' ? ' Website sync is not configured.' : ` Website sync: ${siteSync.status}${siteSync.image ? ' with image.' : ' as a text card.'}`;
      } catch (siteError) {
        console.error('Approved Discord free pick was not synced to the website', { pickId: packet.pick_id, message: String(siteError) });
        siteNote = ' Website sync needs attention.';
      }
    }
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
    await interaction.editReply(`Published to ${channel}. [View official post](${postReference})${siteNote}${xNote}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete this approval action.';
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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startXMonitor();
  startTrendsSchedule();
  startTrendInbox();
  startFreeRecapSchedule();
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
      await handleSourceReviewButton(interaction);
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
    if (pickOptions.sport.toLowerCase() !== 'football' || !/\bnfl\b/i.test(pickOptions.league)) {
      throw new Error('Only NFL picks can be published. Set sport to Football and league to NFL.');
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
      throw new Error('This pick was not verified as an upcoming NFL game scheduled today. No post was made.');
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
