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
  const sections = [
    `💰 Arbitrage: ${channel(env.ARBITRAGE_DESTINATION_CHANNEL_ID, '#arbitrage')}`,
    `🔥 Expert Picks: ${channel(env.EXPERT_PICKS_CHANNEL_ID || env.PUBLISH_CHANNEL_ID, '#expert-picks')}`,
    `📝 Write-Ups: ${channel(env.DAILY_WRITEUPS_CHANNEL_ID, '#all-writeups')}`,
    `🏆 Results: ${channel(env.VIP_WINS_CHANNEL_ID, '#exclusive-wins')}`,
    `💬 Community: ${channel(env.COMMUNITY_CHANNEL_ID, '#community-chat')}`
  ];
  return {
    content: `**Your VIP access is active. Welcome in!**\n\n${sections.join('\n')}\n\nOpen any channel above to see what is available now. No outcome is guaranteed. 21+ where permitted.`
  };
}

function vipRoleIds(env = process.env) {
  return new Set((env.VIP_ACCESS_ROLE_IDS || '1539063967878619218,1542668360985088070').split(',').map(x => x.trim()).filter(Boolean));
}

module.exports = { WELCOME_BUTTON_ID, JOIN_URL, buildWelcomeInvite, buildWelcomeDm, buildVipWelcome, vipRoleIds };
