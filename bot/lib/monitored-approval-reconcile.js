'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { mergeMonitoredApprovalPackets, monitoredCapperKey } = require('./monitored-approval-group');
const { buildSourcePickApprovalEmbed, reviewButtons } = require('./source-review');

async function consolidatePendingMonitoredApprovals({ directory, channel, paidLabel,
  recordRevision = async () => {}, recordSuperseded = async () => {}, logger = console } = {}) {
  let files;
  try { files = (await fs.readdir(directory)).filter(file => file.endsWith('.json')); }
  catch (error) { if (error.code === 'ENOENT') return { groups: 0, retired: 0 }; throw error; }
  const grouped = new Map();
  for (const file of files) {
    const packetPath = path.join(directory, file);
    const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'));
    const key = monitoredCapperKey(packet);
    if (!key || packet.status !== 'READY_FOR_APPROVAL' || !packet.discord_review_message_id
      || packet.approval?.decision || packet.test_only) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ packet, packetPath });
  }
  let groups = 0;
  let retired = 0;
  for (const [capper, rows] of grouped) {
    if (rows.length < 2) continue;
    try {
      rows.sort((a, b) => a.packet.pick_id.localeCompare(b.packet.pick_id));
      const merged = mergeMonitoredApprovalPackets(rows.map(row => row.packet));
      const embed = buildSourcePickApprovalEmbed(merged, 'APPROVED PICK');
      if (embed.description.length > 4096) throw new Error('Discord embed text limit exceeded.');
      const messages = await Promise.all(rows.map(row => channel.messages.fetch(row.packet.discord_review_message_id)));
      // Lock old controls before changing the saved packet. If interrupted,
      // startup retries from the durable queue.
      for (const message of messages) await message.edit({ components: [] });
      const components = reviewButtons(merged.pick_id, { paidOnly: true, paidLabel });
      await fs.writeFile(rows[0].packetPath, `${JSON.stringify(merged, null, 2)}\n`);
      await recordRevision(merged, { messageId: merged.discord_review_message_id,
        payload: { embeds: [embed], components } });
      for (const row of rows.slice(1)) {
        row.packet.status = 'SUPERSEDED';
        row.packet.approval = { ...row.packet.approval, decision: 'GROUPED' };
        row.packet.source.grouped_into = merged.pick_id;
        await fs.writeFile(row.packetPath, `${JSON.stringify(row.packet, null, 2)}\n`);
        await recordSuperseded(row.packet, merged.pick_id);
      }
      await messages[0].edit({ embeds: [embed], components });
      for (let index = 1; index < messages.length; index += 1) {
        await messages[index].delete().catch(async error => {
          logger.warn(`Could not remove grouped @${capper} approval card ${rows[index].packet.pick_id}: ${error.message}`);
          await messages[index].edit({ embeds: [{ color: 0x8A8A8A,
            description: `Combined into the @${capper} approval card above.` }], components: [] });
        });
      }
      groups += 1;
      retired += rows.length - 1;
      logger.log(`Grouped ${rows.length} pending @${capper} approval cards into ${merged.pick_id} with ${merged.analysis.extraction.plays.length} wager(s).`);
    } catch (error) {
      logger.error(`Could not group pending @${capper} approval cards: ${error.message}`);
    }
  }
  return { groups, retired };
}

module.exports = { consolidatePendingMonitoredApprovals };
