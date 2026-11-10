const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const drafts = require('../../drafts/calendar/editorial-drafts.json');
const { approvedSlot } = require('./marketing-calendar');
const { safeXPostLength } = require('./free-pick-x');

const MARKER = 'KBH calendar editorial';
const ASSET_ROOT = path.join(__dirname, '..', '..', 'drafts', 'calendar', 'editorial-assets');
const INVITE = 'https://discord.gg/sB9vzGz2xj';

function parseEditorialButton(customId) {
  const match = /^calendar-editorial:(approve|reject):(cal-\d{8}-[a-z]{3}\d{4}):([a-f0-9]{16})$/.exec(customId || '');
  return match ? { action: match[1], id: match[2], digest: match[3] } : null;
}

async function editorialDrafts(now = Date.now()) {
  const result = [];
  for (const draft of drafts) {
    if (draft.manualOnly) continue;
    const [date, slotId] = draft.slot.split(' ');
    let slot;
    try { slot = approvedSlot(date, slotId, now); }
    catch (error) {
      if (/past or too close|within the next 14 days/.test(error.message)) continue;
      throw error;
    }
    if (!['behind_scenes', 'vip_cta', 'vip_tease'].includes(slot.kind))
      throw new Error(`Unexpected editorial slot ${draft.slot}`);
    if (!draft.xText?.includes(INVITE) || safeXPostLength(draft.xText) > 280 || draft.xText.length > 280)
      throw new Error(`Invalid editorial X copy for ${draft.id}`);
    const filename = `${draft.id}.jpg`;
    const bytes = await fs.readFile(path.join(ASSET_ROOT, filename));
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'jpeg' || metadata.width !== 1080 || metadata.height !== 1920 || bytes.length > 5 * 1024 * 1024)
      throw new Error(`Invalid editorial Story image ${filename}`);
    const digest = crypto.createHash('sha256').update(slot.id).update(slot.scheduledAt).update(draft.xText).update(bytes).digest('hex').slice(0, 16);
    result.push({ draft, slot, bytes, filename, digest, marker: `${MARKER} ${slot.id} ${digest}` });
  }
  return result;
}

function editorialReviewPayload(item, disabled = false) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(new Date(item.slot.scheduledAt));
  return {
    content: `Editorial draft for ${label}. Review the exact X copy and Story image. Approve schedules both. The Story's printed Discord URL is not a tappable link sticker.`,
    embeds: [{ title: `Editorial · ${item.draft.id}`, description: item.draft.xText,
      color: 0x287ef6, image: { url: `attachment://${item.filename}` }, footer: { text: item.marker } }],
    files: [{ attachment: item.bytes, name: item.filename }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Approve X + Story schedule', custom_id: `calendar-editorial:approve:${item.slot.id}:${item.digest}`, disabled },
      { type: 2, style: 4, label: 'Reject draft', custom_id: `calendar-editorial:reject:${item.slot.id}:${item.digest}`, disabled }
    ] }],
    allowedMentions: { parse: [] }
  };
}

module.exports = { MARKER, parseEditorialButton, editorialDrafts, editorialReviewPayload };
