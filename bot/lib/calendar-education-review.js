const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const topics = require('../../drafts/calendar/education-topics.json');
const { approvedSlot } = require('./marketing-calendar');
const { safeXPostLength } = require('./free-pick-x');

const DISCORD_INVITE = 'https://discord.gg/sB9vzGz2xj';
const MARKER = 'KBH calendar education';
const ASSET_ROOT = path.join(__dirname, '..', '..', 'drafts', 'calendar', 'education-assets');

function parseEducationButton(customId) {
  const match = /^calendar-education:(approve|reject):(cal-\d{8}-[a-z]{3}\d{4}):([a-f0-9]{16})$/.exec(customId || '');
  return match ? { action: match[1], id: match[2], digest: match[3] } : null;
}

async function educationDrafts(now = Date.now()) {
  const drafts = [];
  for (const [index, topic] of topics.entries()) {
    if (!topic.slot) continue;
    const [date, slotId] = topic.slot.split(' ');
    let slot;
    try { slot = approvedSlot(date, slotId, now); }
    catch (error) {
      if (/past or too close|within the next 14 days/.test(error.message)) continue;
      throw error;
    }
    if (slot.kind !== 'education' && slot.kind !== 'bankroll') throw new Error(`Unexpected education slot ${topic.slot}`);
    if (!topic.xText?.includes(DISCORD_INVITE) || safeXPostLength(topic.xText) > 280 || topic.xText.length > 280)
      throw new Error(`Invalid education copy for ${topic.id}`);
    const filename = `${String(index + 1).padStart(2, '0')}-${topic.id}.jpg`;
    const bytes = await fs.readFile(path.join(ASSET_ROOT, filename));
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'jpeg' || metadata.width !== 1080 || metadata.height !== 1920 || bytes.length > 5 * 1024 * 1024)
      throw new Error(`Invalid education Story image ${filename}`);
    const digest = crypto.createHash('sha256').update(slot.id).update(slot.scheduledAt).update(topic.xText).update(bytes).digest('hex').slice(0, 16);
    drafts.push({ topic, slot, bytes, filename, digest, marker: `${MARKER} ${slot.id} ${digest}` });
  }
  return drafts;
}

function educationReviewPayload(draft, disabled = false) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(new Date(draft.slot.scheduledAt));
  return {
    content: `Education draft for ${label}. Review the exact X copy and Story image. Approve confirms the facts and KBH artwork rights, then schedules both. The Story's printed URL is not a tappable link sticker.`,
    embeds: [{ title: `Education · ${draft.topic.id}`, description: draft.topic.xText,
      color: 0x287ef6, image: { url: `attachment://${draft.filename}` }, footer: { text: draft.marker } }],
    files: [{ attachment: draft.bytes, name: draft.filename }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Approve X + Story schedule', custom_id: `calendar-education:approve:${draft.slot.id}:${draft.digest}`, disabled },
      { type: 2, style: 4, label: 'Reject draft', custom_id: `calendar-education:reject:${draft.slot.id}:${draft.digest}`, disabled }
    ] }],
    allowedMentions: { parse: [] }
  };
}

module.exports = { DISCORD_INVITE, MARKER, parseEducationButton, educationDrafts, educationReviewPayload };
