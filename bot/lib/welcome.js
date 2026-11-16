const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const WELCOME_BUTTON_ID = 'hub:request-welcome';
const JOIN_URL = 'https://kobesbettinghub.com/join';

function channel(id, fallback) {
  return id ? `<#${id}>` : fallback;
}

function buildWelcomeDm(env = process.env) {
  return new EmbedBuilder()
    .setColor(0x348cf4)
    .setTitle('Welcome to Kobe’s Betting Hub 🏆')
    .setDescription([
      `Start with ${channel(env.START_HERE_CHANNEL_ID, '#start-here')} for a quick tour.`,
      `Today’s free picks: ${channel(env.FREE_PICK_CHANNEL_ID, '#free-picks')}. Read the reasoning and check the tracked results.`,
      `Talk with the community: ${channel(env.COMMUNITY_CHANNEL_ID, '#community-chat')}.`,
      `Want the full picks and tools? ${channel(env.JOIN_VIP_CHANNEL_ID, '#join-vip')} or ${JOIN_URL}.`,
      'VIP also includes reviewed betting arbitrage alerts with both sides, quoted odds, and a calculated stake split. Check the live prices before betting.',
      '21+ where permitted. Wager responsibly; no result is guaranteed.'
    ].join('\n\n'));
}

function buildWelcomeInvite(welcomeRoleId, env = process.env) {
  return {
    content: welcomeRoleId ? `<@&${welcomeRoleId}>` : undefined,
    allowedMentions: welcomeRoleId ? { roles: [welcomeRoleId] } : { parse: [] },
    embeds: [buildWelcomeDm(env)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(WELCOME_BUTTON_ID).setStyle(ButtonStyle.Primary).setLabel('Send me the welcome guide')
    )]
  };
}

function buildVipWelcome(env = process.env) {
  return {
    content: [
      '**Your VIP access is active. Welcome in!**',
      '',
      '🎯 New Trend Search Tool: https://discordapp.com/channels/1215407647155683358/1571285899717771365',
      '💰 Arbitrage: https://discordapp.com/channels/1215407647155683358/1552408437999009983',
      '🔥 Expert Picks: https://discordapp.com/channels/1215407647155683358/1539055850075852911',
      '📝 Write-Ups: https://discordapp.com/channels/1215407647155683358/1562152923725701141 & https://discordapp.com/channels/1215407647155683358/1539055413633228881',
      '💸 Get $20 per referral here: https://discordapp.com/channels/1215407647155683358/1550942922520928256',
      '💬 Community: https://discordapp.com/channels/1215407647155683358/1276995106779693088',
      'Open any channel above to see what is available now. No outcome is guaranteed. 21+ where permitted.'
    ].join('\n')
  };
}

function buildNewMemberDm() {
  return { content: "Hey I'm Kobe, I run the Betting Hub, the server you just joined. Please let me know if you have any questions or things you want to be added to the community. Other than that, enjoy the community" };
}

function vipRoleIds(env = process.env) {
  return new Set((env.VIP_ACCESS_ROLE_IDS || '1539063967878619218,1542668360985088070').split(',').map(x => x.trim()).filter(Boolean));
}

module.exports = { WELCOME_BUTTON_ID, JOIN_URL, buildWelcomeInvite, buildWelcomeDm, buildVipWelcome, buildNewMemberDm, vipRoleIds };
