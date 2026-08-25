const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const WELCOME_BUTTON_ID = 'hub:request-welcome';
const JOIN_URL = 'https://kobesbettinghub.com/join';

function buildComebackEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('I’M BACK 🔥')
    .setDescription([
      'Sports betting is fun, but why not make money together with all of the knowledge from the top sports enthusiasts?',
      'My community hosts a variety of picks, with the majority featuring stats and data from unaffordable and profitable sports experts.',
      'We have seen the results before, and I’ve spent a lot of time improving what happens behind the scenes. Betting Hub is now **faster, cleaner, more consistent, and MUCH easier to use.**',
      '🔥 **What’s different?**\n• Plays are delivered **faster & more consistently**\n• Daily recaps are **automated and posted on schedule**\n• We can now research **far more betting experts** in less time\n• We filter through their plays to find the **highest-probability bets**\n• Football plays come with **research + writeups** so you know WHY we like them\n• The entire member experience is **simpler**',
      'And the results?\n\n🏈 **77% ALL-TIME FOOTBALL WIN RATE 💰**',
      'Those aren’t random picks. I look at **matchups, injuries, trends, history, form, statistics, and anything else that can give a play an edge.** Then we take the best plays and put them **in one place for you.**',
      'It’s **$5,000+ worth of value** for only 30 bucks.\n\nThings you already spend roughly $30 on:\n💈 **A haircut**\n🚗 **A car wash**\n🍔 **A takeout meal**\n🎬 **A movie night**\n☕ **A night out for food & drinks**',
      'You’re already spending $30 on things you have to pay for or do anyway. Why not put that same $30 toward something that can give you access to thousands of dollars worth of sports betting research, picks, data, and information — all in one place?',
      '🏈 **FOOTBALL STARTS NEXT WEEK.**\n\nIf you’ve been waiting for the right time to join, **this is it.**\n\n💰 **40% OFF YOUR FIRST MONTH — ONLY $19**',
      'No digging through 100 different sports experts.\nNo spending hours researching plays.\nNo guessing what to bet.\n\n**I’ll do the research. You get the plays.**\n\n**Welcome back to Betting Hub. 🔥**\n\nJoin here: ' + JOIN_URL
    ].join('\n\n'))
    .setFooter({ text: '21+ where permitted • Wager responsibly • No outcome is guaranteed' });
}

function buildWelcomeInvite(welcomeRoleId) {
  const embed = buildComebackEmbed();

  const row = new ActionRowBuilder().addComponents(
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
  return buildComebackEmbed();
}

module.exports = { WELCOME_BUTTON_ID, JOIN_URL, buildWelcomeInvite, buildWelcomeDm };
