require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { buildPickEmbed, listFromEnv } = require('./lib/pick');
const { buildRecapEmbed } = require('./lib/recap');
const { WELCOME_BUTTON_ID, buildWelcomeInvite, buildWelcomeDm } = require('./lib/welcome');
const { assertPublishableExtraction, buildSourcePickEmbed } = require('./lib/source-review');

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
const freePickChannelId = process.env.FREE_PICK_CHANNEL_ID;
const pickApproverUserIds = listFromEnv(process.env.PICK_APPROVER_USER_IDS);
const reviewQueueRoot = path.join(__dirname, '..', 'data', 'monitoring', 'x', 'review-queue');
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

function isPickApprover(interaction) {
  if (!interaction.inGuild()) return false;
  return interaction.guild.ownerId === interaction.user.id || pickApproverUserIds.has(interaction.user.id);
}

async function approvedTextChannel(channelId) {
  if (!channelId) throw new Error('No destination is configured for this approval action.');
  if (!allowedChannelIds.has(channelId)) throw new Error('That destination is not allowlisted.');
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Configured destination is not a text channel.');
  return channel;
}

function normalizedSport(packet) {
  const sourceSport = `${packet.analysis?.extraction?.sport || ''} ${packet.analysis?.extraction?.league || ''}`.toLowerCase();
  if (/baseball|mlb/.test(sourceSport)) return 'baseball';
  if (/football|nfl|ncaaf/.test(sourceSport)) return 'football';
  if (/basketball|nba|wnba|ncaab/.test(sourceSport)) return 'basketball';
  if (/hockey|nhl/.test(sourceSport)) return 'hockey';
  if (/soccer|fifa|mls/.test(sourceSport)) return 'soccer';
  return null;
}

async function findReviewPacket(pickId) {
  if (!/^[A-Za-z0-9_-]+$/.test(pickId)) return null;
  let dates;
  try {
    dates = await fs.readdir(reviewQueueRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  for (const date of dates.filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    const directory = path.join(reviewQueueRoot, date.name);
    const files = await fs.readdir(directory);
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const packetPath = path.join(directory, file);
      const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'));
      if (packet.pick_id === pickId) return { packet, packetPath };
    }
  }
  return null;
}

async function handleSourceReviewButton(interaction) {
  const [, pickId, action] = interaction.customId.split(':');
  await interaction.deferReply({ ephemeral: true });
  if (!isPickApprover(interaction)) {
    await interaction.editReply('Only Kobe can approve, route, or reject this source draft.');
    return;
  }
  if (!['free', 'paid', 'reject'].includes(action)) {
    await interaction.editReply('This review action is not recognized.');
    return;
  }
  const found = await findReviewPacket(pickId);
  if (!found) {
    await interaction.editReply('The review packet is no longer available. Do not publish it; create a fresh draft.');
    return;
  }
  const { packet, packetPath } = found;
  if (packet.approval?.decision) {
    await interaction.editReply(`This draft was already marked ${packet.approval.decision.toLowerCase()}.`);
    return;
  }

  if (packet.test_only && action !== 'reject') {
    await interaction.editReply('This is a safety test card. Only Reject is enabled; no member-facing post can be made from it.');
    return;
  }

  const approval = packet.approval || {};
  approval.approver = interaction.user.id;
  approval.decided_at = new Date().toISOString();

  if (action === 'reject') {
    approval.decision = 'REJECTED';
    packet.status = 'REJECTED';
    packet.approval = approval;
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await interaction.message.edit({ components: [] });
    await interaction.editReply('Rejected. No member-facing post was made.');
    return;
  }

  try {
    assertPublishableExtraction(packet);
    const sport = normalizedSport(packet);
    const channel = action === 'free'
      ? await approvedTextChannel(freePickChannelId)
      : await approvedTextChannel(sport ? sportChannelMap.get(sport) : undefined);
    const label = action === 'free' ? 'FREE PICK' : 'PAID PICK';
    await channel.send({ embeds: [buildSourcePickEmbed(packet, label)] });
    approval.decision = action === 'free' ? 'FREE_PUBLISHED' : 'PAID_PUBLISHED';
    approval.destination_sport = action === 'free' ? 'free' : sport;
    packet.status = 'PUBLISHED';
    packet.approval = approval;
    await fs.writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await interaction.message.edit({ components: [] });
    await interaction.editReply(`Published to ${channel}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete this approval action.';
    await interaction.editReply(message);
  }
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
  if (interaction.isButton() && interaction.customId.startsWith('source-review:')) {
    try {
      await handleSourceReviewButton(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Unable to complete this review action. No member-facing post was made.');
      } else {
        await interaction.reply({ ephemeral: true, content: 'Unable to complete this review action. No member-facing post was made.' });
      }
    }
    return;
  }

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
    await interaction.deferReply({ ephemeral: true });
    if (!isAdministrator(interaction)) {
      await interaction.editReply('Only a server administrator can post the member welcome invite.');
      return;
    }
    if (!welcomeChannelId) {
      await interaction.editReply('Set WELCOME_CHANNEL_ID in .env before posting the member welcome invite.');
      return;
    }
    try {
      const channel = await client.channels.fetch(welcomeChannelId);
      if (!channel?.isTextBased()) throw new Error('WELCOME_CHANNEL_ID is not a text channel.');
      await channel.send(buildWelcomeInvite(welcomeRoleId));
      await interaction.editReply(`Welcome invite posted to ${channel}.`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Unable to post the member welcome invite.';
      await interaction.editReply(message);
    }
    return;
  }

  if (interaction.commandName === 'post-support-info') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdministrator(interaction)) {
      await interaction.editReply('Only a server administrator can post the support message.');
      return;
    }
    try {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) throw new Error('Choose a text channel for support.');
      await channel.send({
        content: 'Need help with payment or Discord access? Send your issue here and we’ll help.\n\nNever send card details, passwords, login codes, or crypto information.'
      });
      await interaction.editReply(`Support message posted to ${channel}. Pin it from Discord to keep it at the top.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to post the support message.';
      await interaction.editReply(message);
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
