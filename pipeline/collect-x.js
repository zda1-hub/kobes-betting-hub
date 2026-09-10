require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { enrichPacket, researchSupportingNotes } = require('./enrich-pick');
const { reviewQueuePath } = require('../bot/lib/review-queue-path');
const { isNFLPick, upcomingEventStatus } = require('../bot/lib/event-timing');
const { buildSourcePickApprovalEmbed, reviewButtons, sourceCapperName, sourceEvidence, visiblePlays } = require('../bot/lib/source-review');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'twitter-sources.json');
const PICK_WORKFLOW_PATH = path.join(ROOT, 'data', 'pick-workflow.json');
const MONITORING_ROOT = path.join(ROOT, 'data', 'monitoring');
const X_MONITORING_ROOT = path.join(MONITORING_ROOT, 'x');
const CLEANUP_STATE_PATH = path.join(MONITORING_ROOT, '.x-cleanup.json');
const STATE_PATH = path.join(X_MONITORING_ROOT, 'state.json');
// Monitoring state may be cleaned up, but an approval draft must stay present
// for the Discord card that refers to it, including across a Render deploy.
const QUEUE_ROOT = reviewQueuePath();
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const PACIFIC_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit'
});

function pacificDate(date = new Date()) {
  const parts = PACIFIC_FORMATTER.formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function numberFor(date, count) {
  return `${date.replaceAll('-', '')}-${String(count).padStart(3, '0')}`;
}

function likelyPick(text) {
  const post = text || '';
  const market = /\b(over|under|ml|moneyline|spread|run line|puck line|ats)\b/i.test(post);
  const odds = /(?:^|\s|\()[-+]\d{2,4}(?:\)|\b)/.test(post);
  const total = /\b(?:over|under|o|u)\s*\d+(?:\.\d+)?\b/i.test(post);

  // Require a betting market plus a price or total. Sports commentary alone is
  // not enough to enter the review queue.
  return market && (odds || total);
}

function likelyWriteupOrTrend(text, postMediaUrls) {
  if (likelyPick(text)) return true;
  if (postMediaUrls.length === 0) return false;
  return /\b(trend|trends|model|edge|best bet|system play|record|writeup|analysis)\b/i.test(text || '');
}

function shouldQueueForReview(source, post, postMediaUrls) {
  const mode = source.monitoring_mode || 'standard';
  if (mode === 'photo_review') return postMediaUrls.length > 0;
  if (mode === 'writeup_or_trend') return likelyWriteupOrTrend(post.text, postMediaUrls);
  return likelyPick(post.text);
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
    await fs.rm(X_MONITORING_ROOT, { recursive: true, force: true });
    console.log('Cleared the weekly X monitoring folder.');
    await fs.mkdir(MONITORING_ROOT, { recursive: true });
    await fs.writeFile(CLEANUP_STATE_PATH, `${JSON.stringify({ last_cleanup_at: new Date().toISOString() }, null, 2)}\n`);
  }
}

async function xFetch(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
  });
  if (!response.ok) {
    throw new Error(`X API request failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function resolveUser(source, state) {
  const knownId = state.sources?.[source.handle]?.user_id;
  if (knownId) return knownId;
  const lookup = await xFetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(source.handle)}`);
  if (!lookup.data?.id) throw new Error(`No X user ID returned for @${source.handle}.`);
  return lookup.data.id;
}

async function postsFor(source, userId, sinceId) {
  const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
  url.searchParams.set('exclude', 'retweets,replies');
  url.searchParams.set('max_results', '20');
  url.searchParams.set('tweet.fields', 'created_at,attachments,entities');
  url.searchParams.set('expansions', 'attachments.media_keys');
  url.searchParams.set('media.fields', 'url,preview_image_url,type');
  if (sinceId) url.searchParams.set('since_id', sinceId);
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

async function writePacket({ date, sequence, source, post, media }) {
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

  const outputDir = path.join(QUEUE_ROOT, date);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${pickNumber}.json`), `${JSON.stringify(packet, null, 2)}\n`);
  return { packet, outputPath: path.join(outputDir, `${pickNumber}.json`) };
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
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${token}` }
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
    console.warn(`Review packet #${packet.approval_number} saved locally; Discord approval notification is not configured.`);
    return null;
  }

  let embeds;
  try {
    // A clear card is shown exactly as members will see it after approval.
    // Publishing does not add a second layer of wording or formatting.
    // Approval cards may represent regular NFL picks, including sides and
    // totals, and the source may omit optional units or odds. Free-pick
    // eligibility is enforced only when Kobe clicks the Free button; the
    // paid/NFL action remains available for regular picks.
    if (packet.source?.publish_mode !== 'terms_only' && sourceEvidence(packet).length === 0) {
      throw new Error('A regular NFL writeup must include at least one visible breakdown point before approval.');
    }
    embeds = [buildSourcePickApprovalEmbed(packet, 'FREE PICK')];
  } catch (error) {
    // Kobe's review room is for decisions, not diagnostics. Retain the held
    // packet in durable storage for audit, but do not send an unpublishable
    // card with buttons that cannot safely work.
    packet.status = 'HELD_NOT_READY';
    packet.approval_ready = false;
    packet.hold_reason = error instanceof Error ? error.message : 'The candidate is incomplete or not publishable.';
    console.log(`Held ${packet.pick_id}; ${packet.hold_reason}`);
    return null;
  }
  packet.status = 'READY_FOR_APPROVAL';
  packet.approval_ready = true;
  const labels = await approvalButtonLabels(packet);
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      embeds,
      components: reviewButtons(packet.pick_id, labels)
    })
  });

  if (!response.ok) {
    throw new Error(`Discord approval notification failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()).id;
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
      supporting_notes: []
    };
    if (single.source?.publish_mode !== 'terms_only') {
      single.analysis.extraction.supporting_notes = await researchSupportingNotes(single);
    }
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

  await cleanMonitoringFolderIfDue();
  const state = await readJson(STATE_PATH, { sources: {} });
  const date = pacificDate();
  let sequence = await existingCount(date);
  let created = 0;
  let skipped = 0;

  for (const source of sources) {
    if (created >= candidateLimit) break;
    const sourceState = state.sources[source.handle] || {};
    const userId = await resolveUser(source, state);
    // On the first collection window each day, fetch the source's recent posts
    // without its saved cursor. A capper may have posted a valid play before
    // the 11 AM monitor begins; it should still reach Kobe if the event has not
    // started. Later passes return to the normal since_id-only polling.
    const dailyCatchup = sourceState.catchup_date !== date;
    const response = await postsFor(source, userId, dailyCatchup ? undefined : sourceState.since_id);
    const media = mediaUrls(response);
    const posts = [...(response.data || [])].sort((a, b) => a.id.localeCompare(b.id));
    const handledPostIds = new Set(Array.isArray(sourceState.handled_post_ids) ? sourceState.handled_post_ids : []);
    let lastProcessedId = sourceState.since_id || '';
    let completedSourcePass = true;
    for (const post of posts) {
      if (created >= candidateLimit) {
        completedSourcePass = false;
        break;
      }
      if (handledPostIds.has(post.id)) {
        lastProcessedId = post.id;
        continue;
      }
      const postMediaUrls = (post.attachments?.media_keys || []).map((key) => media[key]).filter(Boolean);
      if (!shouldQueueForReview(source, post, postMediaUrls)) {
        console.log(`Skipped @${source.handle} post ${post.id}; no recognizable pick signal.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      sequence += 1;
      const { packet, outputPath } = await writePacket({ date, sequence, source, post, media });
      packet.analysis = await enrichPacket(packet);

      if (!isNFLPick(packet)) {
        await fs.rm(outputPath, { force: true });
        console.log(`Skipped @${source.handle} post ${post.id}; it is not explicitly identified as an NFL/football pick.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      // Repost/leak feeds must reveal the original capper. Do not make Kobe
      // review a card that would credit the feed itself or leave authorship
      // ambiguous.
      if (source.publish_mode === 'terms_only' && !sourceCapperName(packet)) {
        await fs.rm(outputPath, { force: true });
        console.log(`Skipped @${source.handle} post ${post.id}; original capper is not clearly identified.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      // A private card is useful only when its exact game is scheduled today
      // and has not started. Reject undated/ambiguous old cards here rather
      // than spending Kobe's approval time on them.
      const timing = await upcomingEventStatus(packet);
      packet.verification.event_start = timing.eventStart || null;
      packet.verification.event_timezone = timing.source || null;
      if (timing.status !== 'UPCOMING') {
        await fs.rm(outputPath, { force: true });
        console.log(`Skipped @${source.handle} post ${post.id}; ${timing.reason || 'the event is not an upcoming game scheduled today'}.`);
        skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      if (!isSinglePlayPacket(packet)) {
        const splitCreated = await queueSplitPlayPackets(packet, outputPath);
        console.log(`Split @${source.handle} post ${post.id} into ${splitCreated} separate approval card(s).`);
        created += splitCreated;
        if (!splitCreated) skipped += 1;
        lastProcessedId = post.id;
        handledPostIds.add(post.id);
        continue;
      }

      packet.discord_review_message_id = await notifyApprovalChannel(packet);
      await fs.writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
      console.log(`Queued #${packet.approval_number} ${packet.pick_id} from @${source.handle}.`);
      created += 1;
      lastProcessedId = post.id;
      handledPostIds.add(post.id);
    }

    // Advance only through posts we actually examined. If the candidate limit
    // stops the loop, leave later posts for the next collection cycle instead
    // of silently discarding them behind a newer since_id.
    state.sources[source.handle] = {
      user_id: userId,
      since_id: lastProcessedId || response.meta?.newest_id || '',
      handled_post_ids: [...handledPostIds].slice(-250),
      ...(completedSourcePass ? { catchup_date: date } : {})
    };
  }

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

module.exports = { isSinglePlayPacket, runCollector };
