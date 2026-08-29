const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

const sports = [
  ['baseball', 'Baseball'],
  ['basketball', 'Basketball'],
  ['football', 'Football'],
  ['hockey', 'Hockey'],
  ['soccer', 'Soccer'],
  ['other', 'Other']
];

const pickOptions = (command) => command
  .addIntegerOption((option) => option
    .setName('pick_number')
    .setDescription('Kobe approval number, for example 1')
    .setRequired(true)
    .setMinValue(1))
  .addStringOption((option) => option
    .setName('sport')
    .setDescription('Routes to the configured sport channel unless one is selected')
    .setRequired(true)
    .addChoices(...sports.map(([value, name]) => ({ name, value }))))
  .addStringOption((option) => option
    .setName('pick')
    .setDescription('Example: Paul Skenes OVER 6.5 Strikeouts (-115)')
    .setRequired(true)
    .setMaxLength(256))
  .addStringOption((option) => option
    .setName('event')
    .setDescription('Exact matchup/event as published, for example Mets at Dodgers')
    .setRequired(true)
    .setMaxLength(160))
  .addNumberOption((option) => option
    .setName('units_risked')
    .setDescription('Exact risk in units, for example 1 or 0.5')
    .setRequired(true)
    .setMinValue(0.01)
    .setMaxValue(100))
  .addStringOption((option) => option
    .setName('published_line')
    .setDescription('Exact published line, for example OVER 6.5 strikeouts')
    .setRequired(true)
    .setMaxLength(100))
  .addIntegerOption((option) => option
    .setName('published_odds')
    .setDescription('Exact American odds, for example -115 or +120')
    .setRequired(true)
    .setMinValue(-10000)
    .setMaxValue(10000))
  .addStringOption((option) => option
    .setName('evidence')
    .setDescription('4–8 verified points; separate each with a semicolon')
    .setRequired(true)
    .setMaxLength(3500))
  .addNumberOption((option) => option
    .setName('confidence')
    .setDescription('Internal confidence score, not a win probability (0–10)')
    .setRequired(true)
    .setMinValue(0)
    .setMaxValue(10))
  .addStringOption((option) => option
    .setName('league')
    .setDescription('League, for example MLB or NFL')
    .setRequired(false)
    .setMaxLength(40))
  .addStringOption((option) => option
    .setName('image_url')
    .setDescription('Approved relevant image or GIF URL; use this or image')
    .setRequired(false)
    .setMaxLength(1000))
  .addAttachmentOption((option) => option
    .setName('image')
    .setDescription('Approved player/team image or GIF; use this or image_url')
    .setRequired(false))
  .addStringOption((option) => option
    .setName('source_url')
    .setDescription('Public source URL or internal approval reference')
    .setRequired(false)
    .setMaxLength(1000))
  .addChannelOption((option) => option
    .setName('channel')
    .setDescription('Approved destination channel; otherwise the configured default')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false));

const recapOptions = (command) => command
  .addStringOption((option) => option
    .setName('date')
    .setDescription('Operating date in Pacific time, YYYY-MM-DD')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(10))
  .addStringOption((option) => option
    .setName('summary')
    .setDescription('Optional short closing note; record and details come from pick-log.csv')
    .setRequired(false)
    .setMaxLength(1000))
  .addStringOption((option) => option
    .setName('image_url')
    .setDescription('Approved recap image URL; use this or image')
    .setRequired(false)
    .setMaxLength(1000))
  .addAttachmentOption((option) => option
    .setName('image')
    .setDescription('Approved recap image; use this or image_url')
    .setRequired(false))
  .addChannelOption((option) => option
    .setName('channel')
    .setDescription('Approved recap channel; otherwise the configured default')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(false));

const gradePickOptions = new SlashCommandBuilder()
  .setName('grade-pick')
  .setDescription('Record a verified W/L/P/V/PENDING result for an official Pick ID')
  .addStringOption((option) => option
    .setName('pick_id')
    .setDescription('Exact Pick ID from the official Discord post')
    .setRequired(true)
    .setMaxLength(80))
  .addStringOption((option) => option
    .setName('result')
    .setDescription('Verified result for the exact published terms')
    .setRequired(true)
    .addChoices(
      { name: 'Win', value: 'W' },
      { name: 'Loss', value: 'L' },
      { name: 'Push', value: 'P' },
      { name: 'Void', value: 'V' },
      { name: 'Pending', value: 'PENDING' }
    ))
  .addStringOption((option) => option
    .setName('result_source')
    .setDescription('Official game/result URL or clear source reference')
    .setRequired(true)
    .setMaxLength(1000))
  .addStringOption((option) => option
    .setName('outcome')
    .setDescription('Optional final score/stat result')
    .setRequired(false)
    .setMaxLength(300));

const trendOptions = (command) => command
  .addStringOption((option) => option
    .setName('league')
    .setDescription('League to scan from ESPN')
    .setRequired(true)
    .addChoices({ name: 'MLB', value: 'mlb' }, { name: 'NFL', value: 'nfl' }))
  .addStringOption((option) => option
    .setName('date')
    .setDescription('California operating date, YYYY-MM-DD')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(10));

module.exports = [
  pickOptions(
    new SlashCommandBuilder()
      .setName('preview-pick')
      .setDescription('Preview a formatted pick privately before publishing')
  ),
  pickOptions(
    new SlashCommandBuilder()
      .setName('publish-pick')
      .setDescription('Publish an approved, formatted pick to an allowed channel')
  ),
  recapOptions(
    new SlashCommandBuilder()
      .setName('preview-recap')
      .setDescription('Preview a daily recap privately before publishing')
  ),
  recapOptions(
    new SlashCommandBuilder()
      .setName('publish-recap')
      .setDescription('Publish the full daily recap built from pick-log.csv')
  ),
  gradePickOptions,
  trendOptions(
    new SlashCommandBuilder()
      .setName('preview-trends')
      .setDescription('Privately preview an ESPN research trends sheet')
  ),
  trendOptions(
    new SlashCommandBuilder()
      .setName('publish-trends')
      .setDescription('Post an ESPN research trends sheet to private pick approvals')
  ),
  new SlashCommandBuilder()
    .setName('post-welcome-invite')
    .setDescription('Post the opt-in welcome button for current members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('post-support-info')
    .setDescription('Post the official support message in a selected channel')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The support channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('hub-help')
    .setDescription('Show the safe publishing workflow for this bot')
].map((command) => command.toJSON());
