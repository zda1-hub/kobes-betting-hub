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
    .setName('record')
    .setDescription('Example: 2-1-0 (+0.85u)')
    .setRequired(true)
    .setMaxLength(80))
  .addStringOption((option) => option
    .setName('results')
    .setDescription('One verified result per line, e.g. W — #1 — Player OVER 6.5 Ks')
    .setRequired(true)
    .setMaxLength(3500))
  .addStringOption((option) => option
    .setName('summary')
    .setDescription('Short, accurate Kobe-style recap')
    .setRequired(true)
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
      .setDescription('Publish a verified daily recap to an allowed channel')
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
