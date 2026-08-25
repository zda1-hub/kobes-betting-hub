const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const WELCOME_BUTTON_ID = 'hub:request-welcome';
const JOIN_URL = 'https://kobesbettinghub.com/join';

function buildWelcomeInvite(welcomeRoleId) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Welcome to Kobe’s Betting Hub')
    .setDescription('Already a member? Tap the button below to get your welcome and getting-started guide. If your Discord settings allow it, the bot sends it as a DM; otherwise it appears privately here. Need VIP access? Use the Join / rejoin VIP button.')
    .addFields({
      name: 'Important',
      value: 'The team will never DM first for payment, passwords, login codes, full card details, crypto, or device access.'
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(WELCOME_BUTTON_ID)
      .setLabel('Send me the welcome')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👋'),
    new ButtonBuilder()
      .setLabel('Join / rejoin VIP')
      .setStyle(ButtonStyle.Link)
      .setURL(JOIN_URL)
  );

  return {
    content: welcomeRoleId ? `<@&${welcomeRoleId}>` : undefined,
    allowedMentions: welcomeRoleId ? { roles: [welcomeRoleId] } : { parse: [] },
    embeds: [embed],
    components: [row]
  };
}

function buildWelcomeDm() {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Welcome to Kobe’s Betting Hub')
    .setDescription('You’re in. Start in `#start-here`, then read `#rules-and-safety` and `#how-to-use-the-hub`. Official releases are in `#official-picks`, changes in `#pick-updates`, and results in `#daily-recaps`.')
    .addFields(
      {
        name: 'Need help?',
        value: 'Use `#support`. Never send passwords, login codes, full card details, or crypto information.'
      },
      {
        name: 'Quick reminder',
        value: 'No bet is guaranteed. Set limits, never chase losses, and wager only what you can afford to lose.'
      }
    )
    .setFooter({ text: 'Kobe’s Betting Hub • Official welcome' });
}

module.exports = { WELCOME_BUTTON_ID, JOIN_URL, buildWelcomeInvite, buildWelcomeDm };
