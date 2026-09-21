const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pacificOperatingDate } = require('./pick-log');
const { freePickRecapRows } = require('./free-recap');
const { publishApprovedFreePickToSite } = require('./free-pick-site');
const { syncApprovedFreePickToX, readFreePickXReceipt } = require('./free-pick-x');

function deliveryFile(root, id) {
  return path.join(root, `${createHash('sha256').update(id).digest('hex')}.json`);
}

async function saveDelivery(root, state) {
  await fs.mkdir(root, { recursive: true });
  const file = deliveryFile(root, state.pickId);
  await fs.writeFile(`${file}.tmp`, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
}

function eligibleFreeRows(rows, date, channelId) {
  if (!channelId) return [];
  return freePickRecapRows(rows, date, channelId).filter((row) => {
    const ref = String(row.post_reference || '').match(/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/\d+$/);
    return ref?.[1] === channelId && row.published_at && (row.approver || row.published_by);
  }).sort((a, b) => a.published_at.localeCompare(b.published_at));
}

function packetMatchesRow(packet, row) {
  const extraction = packet?.analysis?.extraction || {};
  const play = extraction.plays?.[0] || extraction;
  return packet?.pick_id === row.pick_id
    && String(play.selection || '') === row.selection
    && String(play.line || '') === row.published_line
    && String(play.odds_american || '') === String(row.published_odds_american || '');
}

// Single writer, persistent checkpoints, no historical replay. Website writes
// intentionally omit the image-driven X side effect: all X writes have one D1
// idempotency key and a verifiable receipt, even after an ambiguous response.
function createFreePickDelivery({ root, readRows, loadPacket, verifyPost, paused = async () => false,
  publishSite = publishApprovedFreePickToSite, publishX = syncApprovedFreePickToX,
  readX = readFreePickXReceipt, notify = async () => {}, ingest = async () => {}, channelId,
  today = pacificOperatingDate, logger = console }) {
  let running = null;
  async function drain() {
    if (await paused()) return [];
    const date = today();
    await ingest(date);
    const rows = eligibleFreeRows(await readRows(), date, channelId);
    const results = [];
    for (const row of rows) {
      let state;
      try {
        state = JSON.parse(await fs.readFile(deliveryFile(root, row.pick_id), 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        state = { pickId: row.pick_id, date };
      }
      if (state.complete || state.held) continue;
      const packet = state.packet || await loadPacket(row);
      if (!packetMatchesRow(packet, row) || !await verifyPost(row)) {
        logger.warn(`Free Pick delivery held: canonical terms or Discord receipt missing for ${row.pick_id}.`);
        continue;
      }
      state.packet = packet;
      // Newest approved pick is the current website item. Never let recovery of
      // an earlier pick overwrite a newer one from the same operating day.
      if (row !== rows.at(-1)) state.site = { status: 'superseded' };
      try {
        if (date !== today() || await paused()) break;
        if (!state.site || state.site.status === 'disabled') {
          state.site = await publishSite(packet, { copyImage: false, date });
          await saveDelivery(root, state);
        }
        if (!state.x || !['published', 'disabled'].includes(state.x.status)) {
          const receipt = await readX(packet);
          if (['failed', 'publishing', 'cancelled', 'draft'].includes(receipt.status)) {
            state.held = `X_${receipt.status}`;
            state.x = receipt;
          } else if (receipt.status === 'published' || receipt.status === 'disabled') {
            state.x = receipt;
          } else if (receipt.status === 'approved') {
            state.x = receipt; // Publisher cron already owns this request.
          } else if (receipt.status === 'not_requested') {
            if (date !== today() || await paused()) break;
            state.x = await publishX(packet);
          } else {
            throw new Error('Unrecognized X receipt; refusing a blind retry.');
          }
          await saveDelivery(root, state);
        }
        if (!state.notified && state.site?.storyUrl) {
          await notify(row, state.site);
          state.notified = true;
        }
        state.complete = ['published', 'already_published', 'superseded'].includes(state.site?.status)
          && state.x?.status === 'published';
        state.lastError = null;
      } catch (error) {
        // Error text may contain provider response details; retain only a safe
        // category. Queue IDs remain unchanged on every recovery attempt.
        state.lastError = 'DELIVERY_FAILED';
        logger.error(`Free Pick delivery needs attention for ${row.pick_id}; recovery will check the original receipt.`);
      }
      await saveDelivery(root, state);
      results.push({ pickId: row.pick_id, site: state.site?.status, x: state.x?.status, held: state.held || null, complete: state.complete === true });
    }
    return results;
  }
  return {
    run() {
      if (!running) running = drain().finally(() => { running = null; });
      return running;
    },
    async remember(packet, date = today()) {
      // Safe for commands to seed the exact approved evidence before the first
      // run. Recovery can reconstruct it if the process exits before this write.
      try { await fs.access(deliveryFile(root, packet.pick_id)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await saveDelivery(root, { pickId: packet.pick_id, date, packet });
      }
    }
  };
}

module.exports = { createFreePickDelivery, eligibleFreeRows, packetMatchesRow };
