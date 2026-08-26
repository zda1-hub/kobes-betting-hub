require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { enrichPacket } = require('./enrich-pick');
const { reviewButtons } = require('../bot/lib/source-review');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'twitter-sources.json');
const REVIEW_QUEUE_ROOT = path.join(ROOT, 'data', 'monitoring', 'x', 'review-queue');

function likelyPick(text) {
  const post = text || '';
  const market = /\b(over|under|ml|moneyline|spread|run line|puck line|ats)\b/i.test(post);
  const odds = /(?:^|\s|\()[-+]\d{2,4}(?:\)|\b)/.test(post);
  const total = /\b(?:over|under|o|u)\s*\d+(?:\.\d+)?\b/i.test(post);
  return market && (odds || total);
}

async function xFetch(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
  if (!response.ok) throw new Error(`X API request failed (${response.status}).`);
  return response.json();
}

function hasPhotoCandidate(source, post, mediaUrls) {
  if (source.monitoring_mode !== 'photo_review') return likelyPick(post.text);
  // Photo-review sources often put the line only in the attached graphic. The
  // model still has to say whether it is actually a pick; this only chooses a
  // public image post for the private, one-time extraction test.
  return mediaUrls.length > 0;
}

async function findRealPick(sources, requestedHandle) {
  const normalizedHandle = requestedHandle?.replace(/^@/, '').toLowerCase();
  const selectedSources = normalizedHandle
    ? sources.filter((item) => item.handle.toLowerCase() === normalizedHandle)
    : sources.filter((item) => item.enabled);

  if (normalizedHandle && selectedSources.length === 0) {
    throw new Error(`No configured X source matches @${requestedHandle}.`);
  }

  for (const source of selectedSources) {
    const user = await xFetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(source.handle)}`);
    const url = new URL(`https://api.x.com/2/users/${user.data.id}/tweets`);
    url.searchParams.set('exclude', 'retweets,replies');
    url.searchParams.set('max_results', '20');
    url.searchParams.set('tweet.fields', 'created_at,attachments');
    url.searchParams.set('expansions', 'attachments.media_keys');
    url.searchParams.set('media.fields', 'url,preview_image_url,type');
    const response = await xFetch(url);
    const mediaByKey = Object.fromEntries((response.includes?.media || []).map((item) => [item.media_key, item.url || item.preview_image_url]));
    const candidates = (response.data || []).map((item) => ({
      post: item,
      mediaUrls: (item.attachments?.media_keys || []).map((key) => mediaByKey[key]).filter(Boolean)
    }));
    const candidate = candidates.find(({ post, mediaUrls }) => hasPhotoCandidate(source, post, mediaUrls));
    if (!candidate) continue;
    return {
      source,
      post: candidate.post,
      mediaUrls: candidate.mediaUrls
    };
  }
  return null;
}

function quote(text, maximum = 850) {
  const compact = (text || '').replace(/\n+/g, ' ').trim().replace(/>/g, '›');
  return compact.length > maximum ? `${compact.slice(0, maximum - 1)}…` : compact;
}

function extractedPlayLines(extraction) {
  const plays = Array.isArray(extraction?.plays) && extraction.plays.length
    ? extraction.plays
    : [extraction || {}];
  const lines = plays.map((play) => {
    const terms = [play.selection, play.line, play.odds_american].filter(Boolean).join(' ');
    return terms ? `${terms}${play.units ? ` (${play.units})` : ''}` : '';
  }).filter(Boolean);
  return lines.join('\n') || 'Not clearly visible';
}

async function sendTestCard(packet) {
  const extraction = packet.analysis.extraction;
  const sourceOnlyFields = extraction ? [
    { name: 'Original capper', value: extraction.source_capper_name || 'Not clearly visible', inline: true },
    { name: 'Posted via', value: `@${packet.source.handle}`, inline: true },
    { name: 'Plays shown', value: extractedPlayLines(extraction) }
  ] : [];
  const response = await fetch(`https://discord.com/api/v10/channels/${process.env.PICK_APPROVAL_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        color: 0x2B90D9,
        title: '🧪 Real X extraction test — private review only',
        description: `**Source:** @${packet.source.handle}\n[Open original X post](${packet.source.post_url})\n\n> ${quote(packet.source.text)}`,
        fields: [{
          name: 'Extraction status',
          value: packet.analysis.status
        }, ...sourceOnlyFields, {
          name: 'What the source appears to state (not verified)',
          value: (() => {
            const item = packet.analysis.extraction;
            if (!item) return packet.analysis.detail;
            return [item.sport || item.league, item.event, [item.selection, item.line, item.odds_american].filter(Boolean).join(' ')].filter(Boolean).join(' • ') || 'No complete pick terms extracted.';
          })()
        }, {
          name: 'Still required before approval',
          value: 'Independent live odds and fact checks, source-reuse clearance, Kobe’s final wording/image, and a selected approved destination channel.'
        }],
        footer: { text: 'Button test only — Kobe should press Reject. Publishing is blocked for this test card.' },
        timestamp: new Date().toISOString()
      }],
      components: reviewButtons(packet.pick_id, { testOnly: true })
    })
  });
  if (!response.ok) throw new Error(`Discord test-card upload failed (${response.status}).`);
}

async function saveButtonTestPacket(packet) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const outputDir = path.join(REVIEW_QUEUE_ROOT, date);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${packet.pick_id}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
  return outputPath;
}

async function main() {
  if (!process.env.X_BEARER_TOKEN || !process.env.OPENAI_API_KEY || process.env.ENRICHMENT_ENABLED !== 'true') {
    throw new Error('X monitoring or OpenAI enrichment is not fully configured.');
  }
  const sources = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'));
  const requestedHandle = process.argv[2];
  const candidate = await findRealPick(sources, requestedHandle);
  if (!candidate) {
    throw new Error(requestedHandle
      ? `No suitable recent public post was found for @${requestedHandle}.`
      : 'No recognizable recent pick was found among the enabled sources.');
  }
  const packet = {
    pick_id: `BUTTON-TEST-${candidate.post.id}`,
    test_only: true,
    status: 'TEST_ONLY',
    approval: { approver: 'Kobe', decision: null, destination_sport: null, decided_at: null },
    source: {
      platform: 'Twitter/X',
      handle: candidate.source.handle,
      display_name: candidate.source.display_name,
      post_id: candidate.post.id,
      post_url: `https://x.com/${candidate.source.handle}/status/${candidate.post.id}`,
      posted_at: candidate.post.created_at,
      credit_line: candidate.source.credit_line,
      reuse_permission: candidate.source.reuse_permission,
      text: candidate.post.text,
      media_urls: candidate.mediaUrls
    }
  };
  packet.analysis = await enrichPacket(packet);
  await saveButtonTestPacket(packet);
  await sendTestCard(packet);
  console.log(`Private test sent for @${packet.source.handle}: ${packet.analysis.status}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
