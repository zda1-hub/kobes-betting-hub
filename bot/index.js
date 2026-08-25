require('dotenv').config();

const { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { buildPickEmbed, listFromEnv } = require('./lib/pick');
const { buildRecapEmbed } = require('./lib/recap');
const { WELCOME_BUTTON_ID, buildWelcomeInvite, buildWelcomeDm } = require('./lib/welcome');

const required = ['DISCORD_TOKEN'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
}

const publisherRoleIds = listFromEnv(process.env.PUBLISHER_ROLE_IDS);
const allowedChannelIds = listFromEnv(process.env.ALLOWED_CHANNEL_IDS);
const defaultChannelId = process.env.PUBLISH_CHANNEL_ID;
const recapChannelId = process.env.RECAP_CHANNEL_ID || defaultChannelId;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const welcomeRoleId = process.env.WELCOME_ROLE_ID;
const sportChannelMap = new Map(
  (process.env.SPORT_CHANNEL_MAP || '').split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([sport, channelId]) => sport && channelId)
    .map(([sport, channelId]) => [sport.toLowerCase(), channelId])
);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const welcomedMemberIds = new Set();

function isPublisher(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (publisherRoleIds.size === 0) return false;
  return interaction.member.roles.cache.some((role) => publisherRoleIds.has(role.id));
}

function isAdministrator(interaction) {
  return interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function optionsFrom(interaction) {
  const attachment = interaction.options.getAttachment('image');
  return {
    pickNumber: interaction.options.getInteger('pick_number', true),
    sport: interaction.options.getString('sport', true),
    pick: interaction.options.getString('pick', true),
    evidence: interaction.options.getString('evidence', true),
    confidence: interaction.options.getNumber('confidence', true),
    imageUrl: interaction.options.getString('image_url') || undefined,
    imageAttachmentUrl: attachment?.url,
    sourceUrl: interaction.options.getString('source_url') || undefined
  };
}

async function destinationFor(interaction, fallbackChannelId, sport = null) {
  const selected = interaction.options.getChannel('channel');
  const channelId = selected?.id || (sport ? sportChannelMap.get(sport) : undefined) || fallbackChannelId;
  if (!channelId) throw new Error('No destination configured. Set PUBLISH_CHANNEL_ID or select an allowed channel.');
  if (allowedChannelIds.size > 0 && !allowedChannelIds.has(channelId)) {
    throw new Error('That channel is not in ALLOWED_CHANNEL_IDS.');
  }
  const channel = selected || await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Configured destination is not a text channel.');
  return channel;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

async function registerCommandsOnStart() {
  if (process.env.AUTO_REGISTER_COMMANDS !== 'true') return;
  if (!process.env.DISCORD_APPLICATION_ID) {
    throw new Error('DISCORD_APPLICATION_ID is required when AUTO_REGISTER_COMMANDS=true.');
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID);
  await rest.put(route, { body: commands });
  console.log(process.env.DISCORD_GUILD_ID ? 'Registered guild commands on startup.' : 'Registered global commands on startup.');
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId === WELCOME_BUTTON_ID) {
    try {
      await interaction.deferReply({ ephemeral: true });
      if (welcomedMemberIds.has(interaction.user.id)) {
        await interaction.editReply('Your welcome was already sent. Check your DMs, including any message requests.');
        return;
      }
      try {
        await interaction.user.send({ embeds: [buildWelcomeDm()] });
        welcomedMemberIds.add(interaction.user.id);
        await interaction.editReply('Welcome sent—check your DMs.');
      } catch (dmError) {
        console.warn(`Welcome DM blocked for ${interaction.user.id}:`, dmError);
        await interaction.editReply({
          content: 'Your DMs are blocked, so here is the same welcome privately in Discord:',
          embeds: [buildWelcomeDm()]
        });
      }
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('I could not send the welcome right now. Please try the button again in a moment.');
      } else {
        await interaction.reply({ ephemeral: true, content: 'I could not send the welcome right now. Please try the button again in a moment.' });
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'hub-help') {
    await interaction.reply({
      ephemeral: true,
      content: 'Use `/preview-pick` to review a numbered, formatted post privately. Once Kobe has approved the exact line, odds, evidence, destination sport/channel, and image rights, a configured publisher can use `/publish-pick`. Administrators can use `/post-welcome-invite` to give current members an opt-in welcome DM. This bot posts as a bot, never as Kobe’s personal account.'
    });
    return;
  }

  if (interaction.commandName === 'post-welcome-invite') {
    if (!isAdministrator(interaction)) {
      await interaction.reply({ ephemeral: true, content: 'Only a server administrator can post the member welcome invite.' });
      return;
    }
    if (!welcomeChannelId) {
      await interaction.reply({ ephemeral: true, content: 'Set WELCOME_CHANNEL_ID in .env before posting the member welcome invite.' });
      return;
    }
    try {
      const channel = await client.channels.fetch(welcomeChannelId);
      if (!channel?.isTextBased()) throw new Error('WELCOME_CHANNEL_ID is not a text channel.');
      await channel.send(buildWelcomeInvite(welcomeRoleId));
      await interaction.reply({ ephemeral: true, content: `Welcome invite posted to ${channel}.` });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to post the member welcome invite.';
      await interaction.reply({ ephemeral: true, content: message });
    }
    return;
  }

  if (!isPublisher(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'You are not authorized to publish or preview picks with this bot.' });
    return;
  }

  try {
    const isRecap = interaction.commandName === 'preview-recap' || interaction.commandName === 'publish-recap';
    const attachment = interaction.options.getAttachment('image');
    const embed = isRecap
      ? buildRecapEmbed({
        date: interaction.options.getString('date', true),
        record: interaction.options.getString('record', true),
        results: interaction.options.getString('results', true),
        summary: interaction.options.getString('summary', true),
        imageUrl: interaction.options.getString('image_url') || undefined,
        imageAttachmentUrl: attachment?.url
      })
      : buildPickEmbed(optionsFrom(interaction));
    if (interaction.commandName === 'preview-pick' || interaction.commandName === 'preview-recap') {
      await interaction.reply({ ephemeral: true, embeds: [embed] });
      return;
    }

    const sport = isRecap ? null : interaction.options.getString('sport', true).toLowerCase();
    const channel = await destinationFor(interaction, isRecap ? recapChannelId : defaultChannelId, sport);
    await channel.send({ embeds: [embed] });
    await interaction.reply({ ephemeral: true, content: `Published to ${channel}.` });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unable to process this pick.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ephemeral: true, content: message });
    } else {
      await interaction.reply({ ephemeral: true, content: message });
    }
  }
});

async function start() {
  await registerCommandsOnStart();
  await client.login(process.env.DISCORD_TOKEN);
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Exported for integration checks without logging the bot in.
module.exports = { commands };
