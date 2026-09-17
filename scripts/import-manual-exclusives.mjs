import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { pacificOperatingDate } = require('../bot/lib/pick-log');
const { reviewQueuePath } = require('../bot/lib/review-queue-path');
const { assertPublishableExtraction, reviewButtons } = require('../bot/lib/source-review');
const { initializeAuditStore, recordSourcePost, upsertPickCandidate, recordApprovalCard, recordWorkflowEvent } = require('../pipeline/audit-store');
const { discordRateLimitedFetch } = require('../pipeline/api-client');

export function manualExclusiveGroups(text, date, receivedAt = new Date().toISOString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Explicit operating date is required.');
  return String(text).trim().split(/\r?\n\s*\r?\n/).map((block) => {
    const [name, ...picks] = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!name || !picks.length || picks.some(line => line.length > 300)) throw new Error('Malformed capper group.');
    const id = `manual-${date.replaceAll('-', '')}-${createHash('sha256').update(block.trim()).digest('hex').slice(0, 20)}`;
    const extraction = { is_pick_candidate: true, source_capper_name: name, sport: '', league: '', event: '',
      selection: picks[0], line: '', odds_american: '', units: '', source_claims: [], lossless_text_terms: true,
      plays: picks.map(selection => ({ selection, player_name: /\b(?:yards|receptions|field goals|hits|bases|points|ks|rbis|td)\b/i.test(selection)
        ? selection.match(/^(.+?)\s+(?:Over|Under|Anytime|1st|\d+(?:\.\d+)?\+)/i)?.[1] || '' : '',
        line: '', odds_american: '', units: '', event: '', source_claims: [] })) };
    const packet = { pick_id: id, status: 'READY_FOR_APPROVAL', approval_ready: true,
      source: { platform: 'Operator-submitted', handle: 'owner-submitted-exclusives', display_name: 'Owner-submitted exclusives', post_id: id,
        posted_at: receivedAt, received_at: receivedAt, text: [name, ...picks].join('\n'),
        publish_mode: 'terms_only', reuse_permission: 'OWNER_SUBMITTED', media_urls: [] },
      approval: { decision: null, approver: 'Kobe' },
      analysis: { status: 'SOURCE_EXTRACTED', source_only: true, extraction }, created_at: receivedAt };
    let holdReason = null;
    try { assertPublishableExtraction(packet); } catch (error) { holdReason = error.message; }
    // These terms do not identify a market. Never convert source omissions to ML.
    if (picks.some(line => /^(?:Boston Red Sox\s*\(|(?:LAD|HOU|BUF)\s+[+-]\d+\s*$)/i.test(line))) {
      holdReason = 'Market is missing on at least one supplied wager; Kobe must clarify before publication.';
    }
    packet.manual_review_required = holdReason;
    const components = reviewButtons(id, { freeDisabled: true, freeLabel: 'Free unavailable for exclusives', paidLabel: 'Post to #exclusives' });
    if (holdReason) components[0].components[1].disabled = true;
    const description = [name, ...picks.map(pick => `• ${pick}`)].join('\n');
    if (description.length > 4096) throw new Error('Capper group exceeds Discord card capacity.');
    return { packet, payload: { embeds: [{ color: 0xD4AF37, description,
      ...(holdReason ? { footer: { text: 'Private review: clarify incomplete market before publishing.' } } : {}) }],
      components, allowed_mentions: { parse: [] } }, picks };
  });
}

async function main() {
  require('dotenv').config();
  const args = process.argv.slice(2);
  const file = args.find(value => value.endsWith('.txt'));
  const date = args.find(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (!file || !date) throw new Error('Usage: node scripts/import-manual-exclusives.mjs FILE.txt YYYY-MM-DD [--send]');
  const groups = manualExclusiveGroups(await fs.readFile(file, 'utf8'), date);
  console.log(JSON.stringify({ groups: groups.length, picks: groups.reduce((sum, group) => sum + group.picks.length, 0),
    needsClarification: groups.filter(group => group.packet.manual_review_required).map(group => group.packet.analysis.extraction.source_capper_name) }));
  if (!args.includes('--send')) return;
  if (date !== pacificOperatingDate()) throw new Error('Refusing to import a stale operating day.');
  const channel = process.env.PICK_APPROVAL_CHANNEL_ID;
  if (!channel || !process.env.DISCORD_TOKEN) throw new Error('Production private approval configuration is required.');
  await initializeAuditStore();
  const fetchDiscord = (url, options, id) => discordRateLimitedFetch(url, options, {
    service: 'discord', endpointClass: '/api/v10/channels/{channel_id}/messages',
    callerComponent: 'scripts/import-manual-exclusives', triggerType: 'owner_requested_private_import', pickId: id });
  const headers = { authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'content-type': 'application/json' };
  const check = await fetchDiscord(`https://discord.com/api/v10/channels/${channel}`, { headers });
  if (!check.ok) throw new Error('Cannot verify private approval destination.');
  const channelDetails = await check.json();
  if (channelDetails.guild_id !== process.env.DISCORD_GUILD_ID || !/pick.approvals/i.test(channelDetails.name || '')) throw new Error('Unexpected approval destination.');
  const dir = path.join(reviewQueuePath(), date);
  await fs.mkdir(dir, { recursive: true });
  let sent = 0, existing = 0;
  for (const { packet, payload } of groups) {
    const packetFile = path.join(dir, `${packet.pick_id}.json`);
    try {
      const previous = JSON.parse(await fs.readFile(packetFile, 'utf8'));
      if (previous.discord_review_message_id) { existing++; continue; }
      throw new Error(`Reserved import ${packet.pick_id} has uncertain delivery; reconcile it before retrying.`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await recordSourcePost(packet);
    await upsertPickCandidate(packet, { status: 'READY_FOR_APPROVAL' });
    packet.status = 'MANUAL_SEND_RESERVED';
    await fs.writeFile(packetFile, `${JSON.stringify(packet, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await recordWorkflowEvent(packet, { eventType: 'APPROVAL_CARD_SEND_STARTED', afterState: 'SENDING_APPROVAL_CARD' });
    const response = await fetchDiscord(`https://discord.com/api/v10/channels/${channel}/messages`, { method: 'POST', headers, body: JSON.stringify(payload) }, packet.pick_id);
    if (!response.ok) throw new Error(`Private approval send failed (${response.status}); do not replay uncertain sends.`);
    const message = await response.json();
    if (!message.id || message.channel_id !== channel) throw new Error('Missing private delivery receipt.');
    packet.status = 'READY_FOR_APPROVAL';
    packet.discord_review_message_id = message.id;
    await fs.writeFile(packetFile, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
    await recordApprovalCard(packet, { channelId: channel, messageId: message.id, payload });
    sent++;
    console.log(JSON.stringify({ capper: packet.analysis.extraction.source_capper_name, messageId: message.id, privateOnly: true }));
  }
  console.log(JSON.stringify({ sent, existing, publicPosts: 0 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
}
