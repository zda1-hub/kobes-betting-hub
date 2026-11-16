'use strict';

// Fail closed when Discord cannot confirm the member's roles at send time.
async function hasVipAtSend({ interaction, client, guildId, roleIds }) {
  if (!interaction?.user?.id || interaction.guildId !== guildId) return false;
  try {
    const guild = interaction.guild || await client.guilds.fetch(guildId);
    const member = await guild.members.fetch({ user: interaction.user.id, force: true });
    return [...roleIds].some(id => member.roles.cache.has(id));
  } catch (error) {
    console.warn('Trends VIP role refresh failed:', error.message);
    return false;
  }
}

const UPGRADE_COPY = 'Your search has been completed! Your results are ready, but you must have VIP membership to view player prop trends and statistical breakdowns. Upgrade to VIP to unlock full access.\nhttps://kobesbettinghub.com/join';

module.exports = { hasVipAtSend, UPGRADE_COPY };
