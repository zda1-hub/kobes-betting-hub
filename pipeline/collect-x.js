require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { enrichPacket } = require('./enrich-pick');
const {
  recordApprovalCard,
  recordSourcePost,
  recordWorkflowEvent,
  upsertPickCandidate
} = require('./audit-store');
const { auditedFetch } = require('./api-client');
const { reviewQueuePath } = require('../bot/lib/review-queue-path');
const { isSupportedSportPick, upcomingEventStatuses } = require('../bot/lib/event-timing');
const { buildSourcePickApprovalEmbed, reviewButtons, sourceCapperName, sourceEvidence, visiblePlays } = require('../bot/lib/source-review');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'twitter-sources.json');
const PICK_WORKFLOW_PATH = path.join(ROOT, 'data', 'pick-workflow.json');
// An approval draft must stay present for the Discord card that refers to it,
// including across a Render deploy.
const QUEUE_ROOT = reviewQueuePath();
// Put collection cursors beside the durable review queue. On Render this
// resolves under /var/data, so a deploy cannot forget already-inspected posts
// and repeat the same X lookups and OpenAI extractions. An explicit root is
// supported for migrations and non-Render deployments.
const X_MONITORING_ROOT = process.env.X_MONITORING_ROOT?.trim()
  || path.join(path.dirname(QUEUE_ROOT), 'x-monitoring');
const CLEANUP_STATE_PATH = path.join(X_MONITORING_ROOT, '.cleanup.json');
const STATE_PATH = path.join(X_MONITORING_ROOT, 'state.json');
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
// Revisit image posts once after changing source routing so previously held
// image cards can be reconsidered under the current approval-card mode.
const IMAGE_RESCAN_VERSION = 'source-routing-image-rescan-v3';
// Revisit today's held posts once after expanding event verification from only
// today to the verified upcoming weekend slate. This recovers Friday NFL
// posts for Sunday without duplicating cards already delivered to Kobe.
const UPCOMING_SLATE_RESCAN_VERSION = 'upcoming-slate-rescan-v1';
const FOOTBALL_SCOREBOARD_URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'
];
const PACIFIC_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit'
});

function pacificDate(date = new Date()) {
  const parts = PACIFIC_FORMATTER.formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function pacificStartIso(date) {
  const noon = new Date(`${date}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'longOffset',
    hour: 'numeric'
  }).formatToParts(noon).find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  const offset = match
    ? `${match[1]}${match[2].padStart(2, '0')}:${match[3] || '00'}`
    : '+00:00';
  return new Date(`${date}T00:00:00${offset}`).toISOString();
}

function numberFor(date, count) {
  return `${date.replaceAll('-', '')}-${String(count).padStart(3, '0')}`;
}

function likelyPick(text) {
  const post = text || '';
  const market = /\b(over|under|ml|moneyline|spread|run line|puck line|ats|prop|pick|play|bet|wager|ladder|anytime|to score|first half|full game)\b/i.test(post);
  const odds = /(?:^|\s|\()[-+]\d{2,4}(?:\)|\b)/.test(post);
  const total = /\b(?:over|under|o|u)\s*\d+(?:\.\d+)?\b/i.test(post);
  const line = /(?:^|\s)[-+]\d+(?:\.\d+)?(?=\s|$)/i.test(post);
  const units = /\b\d+(?:\.\d+)?\s*(?:u|units?)\b/i.test(post);
  const statMarket = /\b(?:receptions?|targets?|receiving|rushing|passing|yards?|touchdowns?|tds?|completions?|attempts?|interceptions?|sacks?|points?|rebounds?|assists?|hits?|strikeouts?|walks?|total bases?)\b/i.test(post);
  const plusStat = /\b\d+(?:\.\d+)?\+\s*(?:receptions?|targets?|yards?|touchdowns?|tds?|completions?|attempts?|interceptions?|sacks?|points?|rebounds?|assists?|hits?|strikeouts?|walks?|total bases?)\b/i.test(post);
  const explicitLeaguePick = /\b(?:nfl|football)\b/i.test(post) && (line || total || odds || statMarket || plusStat);

  // Text-only picks are valid. Require recognizable betting language plus a
  // price, line, stake, or stat market so ordinary sports commentary does not
  // flood the vision/extraction queue.
  return (market || units || plusStat || explicitLeaguePick) && (odds || total || line || units || statMarket || plusStat);
}

function likelyWriteupOrTrend(text, postMediaUrls) {
  if (likelyPick(text)) return true;
  if (postMediaUrls.length === 0) return false;
  // A monitored write-up account may put the actual pick and breakdown only
  // in its image. Let the vision extractor inspect every media post; the
  // later NFL, event, and approval gates still reject non-picks and other
  // sports. This prevents valid cards like the LeBron-format example from
  // being discarded solely because its caption is short or generic.
  return true;
}

function shouldQueueForReview(source, post, postMediaUrls) {
  // The pick may exist only inside the attached card. Send every media post
  // from every enabled source through vision; the downstream NFL, exact-event,
  // capper, and publishability gates decide whether it becomes an approval.
  if (postMediaUrls.length > 0) return true;
  // A pick can also be stated entirely in the post text. Let the same
  // downstream gates inspect those candidates instead of dropping them just
  // because there is no attached image.
  return likelyPick(post.text);
}

function footballPriority(post) {
  return /\b(?:nfl|ncaaf|cfb|college football|football)\b/i.test(post?.text || '') ? 0 : 1;
}

function oddsFrom(text) {
  const match = (text || '').match(/\(([-+]\d{2,4})\)/);
  return match ? Number(match[1]) : null;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// This is a deliberate, repository-controlled kill switch. It keeps the
// source roster intact while immediately preventing new approval cards.
// It also works when the collector is run outside the Discord process.
async function pickWorkflowPaused() {
  try {
    return (await readJson(PICK_WORKFLOW_PATH, { paused: false })).paused === true;
  } catch (error) {
    // If the pause configuration cannot be read, do not create review cards.
    // Failing closed is safer than unexpectedly notifying Kobe.
    console.error(`Unable to read pick workflow pause setting; holding collection: ${error.message}`);
    return true;
  }
}

async function cleanMonitoringFolderIfDue() {
  const cleanupState = await readJson(CLEANUP_STATE_PATH, {});
  const lastCleanup = Date.parse(cleanupState.last_cleanup_at || '');
  const due = !Number.isFinite(lastCleanup) || Date.now() - lastCleanup >= WEEK_IN_MS;

  if (due) {
    // state.json is the spend-control cursor. Do not delete it during routine
    // cleanup: losing it causes a full same-day rescan after the next pass.
    await fs.mkdir(X_MONITORING_ROOT, { recursive: true });
    await fs.writeFile(CLEANUP_STATE_PATH, `${JSON.stringify({ last_cleanup_at: new Date().toISOString() }, null, 2)}\n`);
  }
}

async function xFetch(url) {
  const response = await auditedFetch(url, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    signal: AbortSignal.timeout(15000)
  }, {
    service: 'x',
    callerComponent: 'pipeline/collect-x',
    triggerType: 'scheduled_monitor'
  });
  if (!response.ok) {
    throw new Error(`X API request failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function footballGamesScheduledToday({ now = new Date(), fetchImpl = fetch } = {}) {
  const date = pacificDate(now).replaceAll('-', '');
  let successfulChecks = 0;
  for (const scoreboardUrl of FOOTBALL_SCOREBOARD_URLS) {
    try {
      const response = await auditedFetch(`${scoreboardUrl}?dates=${date}&limit=100`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      }, {
        service: 'espn',
        endpointClass: '/apis/site/v2/sports/football/{league}/scoreboard',
        callerComponent: 'pipeline/collect-x',
        triggerType: 'schedule_preflight'
      }, fetchImpl);
      if (!response.ok) continue;
      successfulChecks += 1;
      const payload = await response.json();
      if (Array.isArray(payload.events) && payload.events.length > 0) return true;
    } catch (error) {
      console.warn(`Football schedule preflight was unavailable; continuing with normal gates: ${error instanceof Error ? error.message : error}`);
    }
  }
  return successfulChecks > 0 ? false : null;
}

// Backward-compatible export name for local callers and older tests.
const nflGamesScheduledToday = footballGamesScheduledToday;

async function resolveUser(source, state) {
  const knownId = state.sources?.[source.handle]?.user_id;
  if (knownId) return knownId;
  const lookup = await xFetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(source.handle)}`);
  if (!lookup.data?.id) throw new Error(`No X user ID returned for @${source.handle}.`);
  return lookup.data.id;
}

async function postsFor(source, userId, { sinceId, startTime, nextToken } = {}) {
  const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
  url.searchParams.set('exclude', 'retweets,replies');
  url.searchParams.set('max_results', '100');
  url.searchParams.set('tweet.fields', 'created_at,attachments,entities');
  url.searchParams.set('expansions', 'attachments.media_keys');
  url.searchParams.set('media.fields', 'url,preview_image_url,type');
  if (sinceId) url.searchParams.set('since_id', sinceId);
  if (startTime) url.searchParams.set('start_time', startTime);
  if (nextToken) url.searchParams.set('pagination_token', nextToken);
  return xFetch(url);
}

function mediaUrls(response) {
  return Object.fromEntries((response.includes?.media || []).map((media) => [media.media_key, media.url || media.preview_image_url]));
}

async function existingCount(date) {
  try {
    return (await fs.readdir(path.join(QUEUE_ROOT, date))).filter((file) => file.endsWith('.json')).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function existingSourcePostIds(date) {
  const ids = new Set();
  let files;
  try {
    files = (await fs.readdir(path.join(QUEUE_ROOT, date))).filter((file) => file.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return ids;
    throw error;
  }

  for (const file of files) {
    try {
      const packet = JSON.parse(await fs.readFile(path.join(QUEUE_ROOT, date, file), 'utf8'));
      const postId = packet.source?.post_id;
      // A packet without a Discord review message was held before approval.
      // Leave it eligible for an explicit one-time rescan after a routing fix;
      // packets already sent to Kobe remain deduplicated.
      if (postId && packet.discord_review_message_id) ids.add(String(postId));
    } catch {
      // A malformed historical packet must not stop the live collector.
    }
  }
  return ids;
}

function createPacket({ date, sequence, source, post, media }) {
  const pickNumber = numberFor(date, sequence);
  const packet = {
    pick_id: `${pickNumber}-X`,
    approval_number: sequence,
    status: source.reuse_permission === 'CONFIRMED' ? 'NEEDS_REVIEW' : 'NEEDS_INFO',
    approval_ready: false,
    source: {
      platform: 'Twitter/X',
      handle: source.handle,
      display_name: source.display_name,
      monitoring_mode: source.monitoring_mode || 'standard',
      post_id: post.id,
      post_url: `https://x.com/${source.handle}/status/${post.id}`,
      posted_at: post.created_at,
      credit_line: source.credit_line,
      reuse_permission: source.reuse_permission,
      publish_mode: source.publish_mode || 'writeup_review',
      text: post.text,
      media_urls: (post.attachments?.media_keys || []).map((key) => media[key]).filter(Boolean)
    },
    extracted: {
      original_odds_american: oddsFrom(post.text),
      likely_pick: likelyPick(post.text),
      event: null,
      sport: null,
      market: null,
      selection: null,
      line: null,
      units_risked: null
    },
    verification: {
      current_odds: null,
      current_odds_captured_at: null,
      stats_and_past_performance_source: null,
      official_result_source: null,
      reviewer: null,
      reviewed_at: null
    },
    approval: {
      approver: 'Kobe',
      decision: null,
      destination_sport: null,
      image_url: null,
      exact_final_copy: null,
      decided_at: null
    },
    analysis: {
      status: 'NOT_STARTED',
      detail: 'Source extraction has not run yet.',
      extracted_at: null,
      model: null,
      source_only: true,
      extraction: null,
      draft_status: 'WAITING_FOR_INDEPENDENT_VERIFICATION'
    },
    created_at: new Date().toISOString()
  };

  return packet;
}

async function writePacket({ date, packet }) {
  const pickNumber = numberFor(date, packet.approval_number);
  const outputDir = path.join(QUEUE_ROOT, date);
  const outputPath = path.join(outputDir, `${pickNumber}.json`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
  return outputPath;
}

function quote(text, maximum = 900) {
  const compact = (text || '').replace(/\n+/g, ' ').trim();
  const shortened = compact.length > maximum ? `${compact.slice(0, maximum - 1)}…` : compact;
  return shortened.replace(/>/g, '›');
}

function extractionSummary(packet) {
  const analysis = packet.analysis || {};
  const extraction = analysis.extraction;
  if (!extraction) return `**Extraction:** ${analysis.status || 'NOT_STARTED'}\n${analysis.detail || 'No extraction available.'}`;
  const terms = [
    extraction.sport || extraction.league,
    extraction.event,
    [extraction.selection, extraction.line, extraction.odds_american].filter(Boolean).join(' ')
  ].filter(Boolean).join(' • ');
  const missing = (extraction.missing_or_ambiguous || []).slice(0, 3).join('; ');
  return `**Source extraction (not verified):** ${terms || 'No complete terms found.'}${missing ? `\n**Needs checking:** ${missing}` : ''}`;
}

function isSinglePlayPacket(packet) {
  return visiblePlays(packet).length === 1;
}

function shouldSplitPlayPackets(packet) {
  // Regular posts get one approval card per play. Exclusives intentionally
  // stay grouped so Kobe sees the original capper followed by every stated
  // bet/stake as one bullet list, matching the requested public format.
  return packet.source?.publish_mode !== 'terms_only' && !isSinglePlayPacket(packet);
}

function normalizedSport(packet) {
  const sourceSport = `${packet.analysis?.extraction?.sport || ''} ${packet.analysis?.extraction?.league || ''}`.toLowerCase();
  if (/baseball|mlb/.test(sourceSport)) return 'baseball';
  if (/football|nfl|ncaaf/.test(sourceSport)) return 'football';
  if (/basketball|nba|wnba|ncaab/.test(sourceSport)) return 'basketball';
  if (/hockey|nhl/.test(sourceSport)) return 'hockey';
  if (/soccer|fifa|mls/.test(sourceSport)) return 'soccer';
  return '';
}

function sportChannelId(packet) {
  const sport = normalizedSport(packet);
  const entries = (process.env.SPORT_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([key, value]) => key && value);
  return entries.find(([key]) => key.toLowerCase() === sport)?.[1] || '';
}

async function discordChannelLabel(channelId, fallback) {
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !token) return fallback;
  try {
    const response = await auditedFetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${token}` }
    }, {
      service: 'discord',
      endpointClass: '/api/v10/channels/{channel_id}',
      callerComponent: 'pipeline/collect-x',
      triggerType: 'approval_label_lookup'
    });
    if (!response.ok) return fallback;
    const channel = await response.json();
    return channel?.name ? `#${channel.name}` : fallback;
  } catch {
    return fallback;
  }
}

async function approvalButtonLabels(packet) {
  const free = await discordChannelLabel(process.env.FREE_PICK_CHANNEL_ID, '#daily-free-play');
  const paidChannelId = packet.source?.publish_mode === 'terms_only'
    ? (process.env.EXCLUSIVES_CHANNEL_ID || '1539055850075852911')
    : sportChannelId(packet);
  const paidFallback = packet.source?.publish_mode === 'terms_only' ? '#exclusives' : '#paid-sport';
  const paid = await discordChannelLabel(paidChannelId, paidFallback);
  return { freeLabel: `Post to ${free}`, paidLabel: `Post to ${paid}` };
}

async function notifyApprovalChannel(packet) {
  const channelId = process.env.PICK_APPROVAL_CHANNEL_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !token) {
    await upsertPickCandidate(packet, { status: 'HELD_NOT_READY', rejectionCodes: ['APPROVAL_CHANNEL_NOT_CONFIGURED'] });
    await recordWorkflowEvent(packet, {
      eventType: 'CANDIDATE_HELD',
      afterState: 'HELD_NOT_READY',
      details: { rejection_code: 'APPROVAL_CHANNEL_NOT_CONFIGURED' }
    });
    console.warn(`Review packet #${packet.approval_number} saved locally; Discord approval notification is not configured.`);
    return null;
  }

  let embeds;
  try {
    // A clear card is shown exactly as members will see it after approval.
    // Publishing does not add a second layer of wording or formatting.
    // Approval cards may represent regular picks from any supported sport,
    // including sides and totals, and the source may omit optional units or odds. Free-pick
    // eligibility is enforced only when Kobe clicks the Free button; the
    // paid/NFL action remains available for regular picks.
    if (packet.source?.publish_mode !== 'terms_only' && sourceEvidence(packet).length < 3) {
      throw new Error('A regular writeup must include at least three clean, relevant breakdown points before approval.');
    }
    embeds = [buildSourcePickApprovalEmbed(packet, 'FREE PICK')];
  } catch (error) {
    // Kobe's review room is for decisions, not diagnostics. Retain the held
    // packet in durable storage for audit, but do not send an unpublishable
    // card with buttons that cannot safely work.
    packet.status = 'HELD_NOT_READY';
    packet.approval_ready = false;
    packet.hold_reason = error instanceof Error ? error.message : 'The candidate is incomplete or not publishable.';
    await upsertPickCandidate(packet, { status: 'HELD_NOT_READY', rejectionCodes: ['APPROVAL_CARD_NOT_READY'] });
    await recordWorkflowEvent(packet, {
      eventType: 'CANDIDATE_HELD',
      beforeState: 'ELIGIBLE',
      afterState: 'HELD_NOT_READY',
      details: { rejection_code: 'APPROVAL_CARD_NOT_READY', reason: packet.hold_reason }
    });
    console.log(`Held ${packet.pick_id}; ${packet.hold_reason}`);
    return null;
  }
  packet.status = 'READY_FOR_APPROVAL';
  packet.approval_ready = true;
  const labels = await approvalButtonLabels(packet);
  const payload = {
    embeds,
    components: reviewButtons(packet.pick_id, labels)
  };
  await upsertPickCandidate(packet, { status: 'READY_FOR_APPROVAL' });
  await recordWorkflowEvent(packet, {
    eventType: 'APPROVAL_CARD_SEND_STARTED',
    beforeState: 'ELIGIBLE',
    afterState: 'SENDING_APPROVAL_CARD',
    details: { channel_id: channelId }
  });
  const response = await auditedFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }, {
    service: 'discord',
    endpointClass: '/api/v10/channels/{channel_id}/messages',
    callerComponent: 'pipeline/collect-x',
    triggerType: 'approval_card',
    workflowId: packet.pick_id,
    pickId: packet.pick_id
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 500);
    await recordWorkflowEvent(packet, {
      eventType: 'APPROVAL_CARD_SEND_FAILED',
      beforeState: 'SENDING_APPROVAL_CARD',
      afterState: 'APPROVAL_SEND_FAILED',
      details: { response_status: response.status, error: detail }
    });
    throw new Error(`Discord approval notification failed (${response.status}): ${detail}`);
  }
  const messageId = (await response.json()).id;
  await recordApprovalCard(packet, { channelId, messageId, payload });
  return messageId;
}

async function recordGateDecision(packet, { code, reason, status = 'REJECTED' }) {
  await upsertPickCandidate(packet, { status, rejectionCodes: [code] });
  await recordWorkflowEvent(packet, {
    eventType: status === 'ELIGIBLE'
      ? 'CANDIDATE_ELIGIBLE'
      : status === 'REJECTED'
        ? 'CANDIDATE_REJECTED'
        : 'CANDIDATE_SKIPPED',
    beforeState: packet.status || 'OBSERVED',
    afterState: status,
    details: { rejection_code: status === 'ELIGIBLE' ? null : code, reason }
  });
}

async function queueSplitPlayPackets(packet, outputPath) {
  const extraction = packet.analysis?.extraction || {};
  const plays = Array.isArray(extraction.plays) ? extraction.plays.filter((play) => visiblePlays({ analysis: { extraction: { plays: [play] } } }).length) : [];
  await fs.rm(outputPath, { force: true });
  let created = 0;
  const baseId = packet.pick_id.replace(/-X$/, '');
  for (let index = 0; index < plays.length; index += 1) {
    const play = plays[index];
    const single = structuredClone(packet);
    const suffix = String(index + 1).padStart(2, '0');
    single.pick_id = `${baseId}-${suffix}-X`;
    single.approval_number = Number(`${packet.approval_number}${index + 1}`);
    single.analysis.extraction = {
      ...extraction,
      ...play,
      plays: [play],
      // Keep the source-visible breakdown on every split card. The public
      // layout remains exact terms first, followed by the same clean bullets;
      // removing them here would create the incomplete cards Kobe has been
      // seeing.
      source_claims: Array.isArray(extraction.source_claims) ? [...extraction.source_claims] : [],
      supporting_notes: Array.isArray(extraction.supporting_notes) ? [...extraction.supporting_notes] : []
    };
    const splitPath = path.join(path.dirname(outputPath), `${baseId}-${suffix}.json`);
    single.discord_review_message_id = await notifyApprovalChannel(single);
    await fs.writeFile(splitPath, `${JSON.stringify(single, null, 2)}\n`);
    if (single.discord_review_message_id) created += 1;
  }
  return created;
}

async function runCollector({ maxCandidates } = {}) {
  if (await pickWorkflowPaused()) {
    console.log('Pick workflow is paused; no X posts will be collected or sent for approval.');
    return { created: 0, skipped: 0, sourceCount: 0, paused: true };
  }
  const sources = (await readJson(SOURCES_PATH, [])).filter((source) => source.enabled);
  if (sources.length === 0) {
    console.log('No X sources are enabled. Nothing to collect.');
    return { created: 0, skipped: 0, sourceCount: 0 };
  }

  const candidateLimit = Number.isFinite(maxCandidates) && maxCandidates > 0
    ? Math.floor(maxCandidates)
    : Number.POSITIVE_INFINITY;

  if (!process.env.X_BEARER_TOKEN) {
    throw new Error('Missing X_BEARER_TOKEN. Add it to a local .env file; do not commit or send it in chat.');
  }

  const date = pacificDate();
  // Check the priority sports first, but do not use their slate as a global
  // gate: baseball, basketball, hockey, soccer, and other configured sports
  // must still be collected when football is off.
  const footballGamesToday = await footballGamesScheduledToday();
  if (footballGamesToday === false) {
    console.log(`No NFL or college-football games are scheduled for ${date}; continuing with all supported sports.`);
  } else if (footballGamesToday === true) {
    console.log(`NFL or college-football games are scheduled for ${date}; priority sports remain first in the intake gates.`);
  }

  await cleanMonitoringFolderIfDue();
  const state = await readJson(STATE_PATH, { sources: {} });
  let sequence = await existingCount(date);
  const queuedSourcePostIds = await existingSourcePostIds(date);
  // Keep one Render service and one durable queue, but let a bounded number of
  // source scans run at once. This removes the old 38-account serial bottleneck
  // without creating duplicate workers or uncoordinated state files.
  const configuredConcurrency = Number(process.env.X_MONITOR_CONCURRENCY || 12);
  const concurrency = Number.isInteger(configuredConcurrency) && configuredConcurrency >= 1
    ? Math.min(configuredConcurrency, 12)
    : 12;
  console.log(`Scanning ${sources.length} enabled X sources with ${Math.min(concurrency, sources.length)} bounded intake worker(s).`);
  const claimedSourcePostIds = new Set(queuedSourcePostIds);
  let created = 0;
  let skipped = 0;

  let nextSourceIndex = 0;
  let commitChain = Promise.resolve();

  async function inspectSource(source) {
    const sourceState = state.sources[source.handle] || {};
    const userId = await resolveUser(source, state);
    // On the first collection window each day, fetch every source post since
    // today's Pacific midnight, not just the newest page. A capper may have
    // posted a valid play earlier in the day; it should still reach Kobe if the
    // event has not started. Later passes return to normal since_id polling.
    const rescanImages = sourceState.image_rescan_version !== IMAGE_RESCAN_VERSION;
    const rescanUpcomingSlate = sourceState.upcoming_slate_rescan_version !== UPCOMING_SLATE_RESCAN_VERSION;
    const dailyCatchup = sourceState.catchup_date !== date || rescanImages || rescanUpcomingSlate;
    const startTime = dailyCatchup ? pacificStartIso(date) : undefined;
    const responses = [];
    let nextToken;
    do {
      const response = await postsFor(source, userId, {
        sinceId: dailyCatchup ? undefined : sourceState.since_id,
        startTime,
        nextToken
      });
      responses.push(response);
      nextToken = dailyCatchup ? response.meta?.next_token : undefined;
    } while (nextToken);
    const response = responses[0] || {};
    const media = Object.assign({}, ...responses.map(mediaUrls));
    // Text-labelled NFL and college-football posts get first look. Keep the
    // original ID as the tie-breaker so a source remains deterministic.
    const posts = responses.flatMap((page) => page.data || [])
      .sort((a, b) => footballPriority(a) - footballPriority(b) || b.id.localeCompare(a.id));
    if (dailyCatchup && responses.length > 1) {
      console.log(`Backfilled ${posts.length} post(s) from @${source.handle} since ${startTime}.`);
    }
    const handledPostIds = new Set(Array.isArray(sourceState.handled_post_ids) ? sourceState.handled_post_ids : []);
    let lastProcessedId = sourceState.since_id || '';
    let completedSourcePass = true;
    const acceptedPackets = [];
    for (const post of posts) {
      const postMediaUrls = (post.attachments?.media_keys || []).map((key) => media[key]).filter(Boolean);
      const packet = createPacket({ date, sequence: 0, source, post, media });
      await recordSourcePost(packet);
      if (claimedSourcePostIds.has(String(post.id))) {
        await recordGateDecision(packet, { code: 'ALREADY_QUEUED', reason: 'This X post already has a current approval packet.', status: 'DEDUPLICATED' });
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }
      // The one-time image rescan revisits posts previously marked handled by
      // the old caption filter, but never creates a duplicate for a post that
      // already has a current-day approval packet.
      const revisitHeldPost = !queuedSourcePostIds.has(String(post.id))
        && ((rescanImages && postMediaUrls.length > 0) || rescanUpcomingSlate);
      if (handledPostIds.has(post.id) && !revisitHeldPost) {
        await recordGateDecision(packet, { code: 'ALREADY_HANDLED', reason: 'This source post was already evaluated in an earlier collection pass.', status: 'DEDUPLICATED' });
        lastProcessedId = post.id;
        continue;
      }
      if (!shouldQueueForReview(source, post, postMediaUrls)) {
        await recordGateDecision(packet, { code: 'NO_BET_SIGNAL', reason: 'No deterministic betting signal was found before model extraction.' });
        console.log(`Skipped @${source.handle} post ${post.id}; no recognizable pick signal.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }
      claimedSourcePostIds.add(String(post.id));

      // Extract the source terms first. Research is intentionally deferred
      // until the cheap NFL, exact-event, and roster gates pass; otherwise a
      // rejected candidate can spend minutes on web search and block the rest
      // of the 38-account scan.
      packet.analysis = await enrichPacket(packet, { research: false });

      if (!isSupportedSportPick(packet)) {
        await recordGateDecision(packet, { code: 'UNSUPPORTED_SPORT', reason: 'The extraction did not identify a supported sport.' });
        console.log(`Skipped @${source.handle} post ${post.id}; it is not explicitly identified as a supported sport pick.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      if (packet.analysis.status !== 'SOURCE_EXTRACTED' || !packet.analysis.extraction?.is_pick_candidate) {
        const code = packet.analysis.status === 'SOURCE_EXTRACTED' ? 'MODEL_NOT_PICK_CANDIDATE' : 'EXTRACTION_FAILED';
        await recordGateDecision(packet, { code, reason: packet.analysis.detail || 'The model did not return a publishable source extraction.' });
        console.log(`Skipped @${source.handle} post ${post.id}; the source did not identify a publishable pick.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      // Repost/leak feeds must reveal the original capper. Do not make Kobe
      // review a card that would credit the feed itself or leave authorship
      // ambiguous.
      if (source.publish_mode === 'terms_only' && !sourceCapperName(packet)) {
        await recordGateDecision(packet, { code: 'MISSING_SOURCE_CAPPER', reason: 'The original capper was not clearly identified.' });
        console.log(`Skipped @${source.handle} post ${post.id}; original capper is not clearly identified.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      // A card is useful only when its exact event is scheduled today and has
      // not started. For regular multi-play cards, keep the valid upcoming
      // legs and split them into separate cards instead of losing the whole
      // post because one leg is stale or ambiguous. Exclusives stay grouped.
      const timing = await upcomingEventStatuses(packet);
      packet.verification.event_start = timing.eventStart || null;
      packet.verification.event_timezone = timing.source || null;
      const extractedPlays = Array.isArray(packet.analysis.extraction.plays)
        ? packet.analysis.extraction.plays
        : [];
      const validPlayStatuses = Array.isArray(timing.playStatuses)
        ? timing.playStatuses.filter((result) => result.status === 'UPCOMING')
        : [];
      if (packet.source?.publish_mode !== 'terms_only' && extractedPlays.length > 1 && validPlayStatuses.length > 0) {
        const validPlays = validPlayStatuses.map((result) => result.play);
        packet.analysis.extraction.plays = validPlays;
        const validStarts = validPlayStatuses
          .map((result) => Date.parse(result.eventStart || ''))
          .filter((value) => Number.isFinite(value));
        if (validStarts.length > 0) {
          packet.verification.event_start = new Date(Math.min(...validStarts)).toISOString();
          packet.verification.event_timezone = validPlayStatuses[0].source || null;
        }
        if (validPlays.length === 1 && validPlays[0].event) {
          packet.analysis.extraction.event = validPlays[0].event;
        }
        const firstRejected = timing.playStatuses.find((result) => result.status !== 'UPCOMING');
        if (firstRejected) {
          await recordWorkflowEvent(packet, {
            eventType: 'MULTIPLAY_FILTERED',
            beforeState: 'SOURCE_EXTRACTED',
            afterState: 'PARTIALLY_ELIGIBLE',
            details: {
              kept_play_count: validPlays.length,
              rejected_play_count: timing.playStatuses.length - validPlays.length,
              first_rejection_status: firstRejected.status,
              first_rejection_reason: firstRejected.reason || null
            }
          });
          console.log(`Kept ${validPlays.length} upcoming leg(s) from @${source.handle} post ${post.id}; dropped other leg(s): ${firstRejected.reason || firstRejected.status}.`);
        }
        await recordGateDecision(packet, { code: 'ELIGIBLE', reason: `${validPlays.length} upcoming play(s) passed source and event gates.`, status: 'ELIGIBLE' });
        acceptedPackets.push({ packet, postId: String(post.id), source, post });
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }
      if (timing.status !== 'UPCOMING') {
        const timingCode = timing.status === 'STARTED_OR_FINISHED'
          ? 'STALE_EVENT'
          : timing.status === 'PLAYER_NOT_ON_EVENT_TEAM'
            ? 'PLAYER_NOT_ON_EVENT_TEAM'
            : 'EVENT_NOT_VERIFIED';
        await recordGateDecision(packet, { code: timingCode, reason: timing.reason || timing.status });
        console.log(`Skipped @${source.handle} post ${post.id}; ${timing.reason || 'the event is not an upcoming game scheduled today'}.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      await recordGateDecision(packet, { code: 'ELIGIBLE', reason: 'Source extraction and event gates passed.', status: 'ELIGIBLE' });
      acceptedPackets.push({ packet, postId: String(post.id), source, post });
      lastProcessedId = post.id;
      handledPostIds.add(post.id);
    }

    // Advance only through posts we actually examined. If the candidate limit
    // stops the loop, leave later posts for the next collection cycle instead
    // of silently discarding them behind a newer since_id.
    const nextSourceState = {
      user_id: userId,
      // With priority ordering, an incomplete pass can leave an older
      // non-football post unexamined. Keep the old cursor in that case so the
      // next interval can revisit it; handled_post_ids prevents duplicates.
      since_id: completedSourcePass ? (lastProcessedId || response.meta?.newest_id || '') : (sourceState.since_id || ''),
      handled_post_ids: [...handledPostIds].slice(-250),
      ...(completedSourcePass ? { catchup_date: date } : {})
    };
    if (sourceState.image_rescan_version) {
      nextSourceState.image_rescan_version = sourceState.image_rescan_version;
    }
    if (rescanImages && completedSourcePass) {
      nextSourceState.image_rescan_version = IMAGE_RESCAN_VERSION;
    }
    if (rescanUpcomingSlate && completedSourcePass) {
      nextSourceState.upcoming_slate_rescan_version = UPCOMING_SLATE_RESCAN_VERSION;
    }
    return { source, nextSourceState, acceptedPackets };
  }

  async function commitSourceResult(result) {
    state.sources[result.source.handle] = result.nextSourceState;
    for (const candidate of result.acceptedPackets) {
      if (created >= candidateLimit) break;
      sequence += 1;
      const packet = candidate.packet;
      packet.approval_number = sequence;
      packet.pick_id = `${numberFor(date, sequence)}-X`;
      const outputPath = await writePacket({ date, packet });

      if (shouldSplitPlayPackets(packet)) {
        const splitCreated = await queueSplitPlayPackets(packet, outputPath);
        console.log(`Split @${candidate.source.handle} post ${candidate.post.id} into ${splitCreated} separate approval card(s).`);
        created += splitCreated;
        if (!splitCreated) skipped += 1;
        queuedSourcePostIds.add(candidate.postId);
        continue;
      }

      packet.discord_review_message_id = await notifyApprovalChannel(packet);
      await fs.writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
      console.log(`Queued #${packet.approval_number} ${packet.pick_id} from @${candidate.source.handle}.`);
      created += 1;
      queuedSourcePostIds.add(candidate.postId);
    }
  }

  async function sourceWorker() {
    while (true) {
      const sourceIndex = nextSourceIndex;
      nextSourceIndex += 1;
      if (sourceIndex >= sources.length) return;
      const source = sources[sourceIndex];
      try {
        const result = await inspectSource(source);
        // Discord/file writes remain serialized, while source fetching,
        // extraction, and event checks overlap across the bounded workers.
        commitChain = commitChain
          .then(() => commitSourceResult(result))
          .catch((error) => console.error(`Commit failed for @${source.handle}: ${error.message}`));
        await commitChain;
      } catch (error) {
        console.error(`Source scan failed for @${source.handle}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => sourceWorker()));
  await commitChain;

  await fs.mkdir(X_MONITORING_ROOT, { recursive: true });
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  if (created) {
    console.log(`Created ${created} review packet(s).`);
  } else if (skipped) {
    console.log(`Skipped ${skipped} non-pick post(s); no review packets created.`);
  } else {
    console.log('No new X posts found.');
  }

  if (created >= candidateLimit && Number.isFinite(candidateLimit)) {
    console.log(`Candidate limit reached: ${candidateLimit} review packet(s).`);
  }
  return { created, skipped, sourceCount: sources.length };
}

if (require.main === module) {
  runCollector().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { footballGamesScheduledToday, footballPriority, isSinglePlayPacket, likelyWriteupOrTrend, nflGamesScheduledToday, runCollector, shouldQueueForReview, shouldSplitPlayPackets };
