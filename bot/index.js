require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, PermissionFlagsBits, REST, Routes } = require('discord.js');
const commands = require('./commands');
const { buildPickEmbed, listFromEnv } = require('./lib/pick');
const { buildLogRecapEmbeds } = require('./lib/recap');
const { appendOfficialPick, makePickId, netUnitsFor, pacificOperatingDate, readPickLog, updateOfficialPick } = require('./lib/pick-log');
const { WELCOME_BUTTON_ID, buildWelcomeInvite, buildWelcomeDm } = require('./lib/welcome');
const { assertPublishableExtraction, buildSourcePickEmbed } = require('./lib/source-review');
const { runCollector } = require('../pipeline/collect-x');

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
let xCollectionInProgress = false;

function xMonitorIntervalMs() {
  const configured = Number(process.env.X_MONITOR_INTERVAL_MS || 300000);
  // Guard against an accidental rapid polling setting that could create an
  // unnecessary X API bill. Five minutes is the default; one minute is the floor.
  if (!Number.isFinite(configured) || configured < 60000) return 300000;
  return configured;
}

function xMonitorStartAtMs() {
  const raw = process.env.X_MONITOR_START_AT?.trim();
  if (!raw) return null;

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    console.warn('Ignoring invalid X_MONITOR_START_AT. Use an ISO time with timezone, for example 2026-08-27T07:00:00-07:00.');
    return null;
  }

  return timestamp;
}

async function collectXSafely() {
  if (xCollectionInProgress) {
    console.log('X collection is already running; skipped overlapping interval.');
    return;
  }

  xCollectionInProgress = true;
  try {
    await runCollector();
  } catch (error) {
    console.error(`X collection failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    xCollectionInProgress = false;
  }
}

function startXMonitor() {
  if (process.env.X_MONITOR_ENABLED !== 'true') {
    console.log('X monitoring is disabled. Set X_MONITOR_ENABLED=true only when Kobe authorizes the launch.');
    return;
  }

  const beginMonitoring = () => {
    const interval = xMonitorIntervalMs();
    console.log(`X monitoring enabled: checking approved sources every ${Math.round(interval / 60000)} minute(s).`);
    void collectXSafely();
    setInterval(() => void collectXSafely(), interval);
  };

  const startAtMs = xMonitorStartAtMs();
  const delayMs = startAtMs === null ? 0 : startAtMs - Date.now();
  if (delayMs <= 0) {
    beginMonitoring();
    return;
  }

  console.log(`X monitoring is scheduled to begin at ${new Date(startAtMs).toISOString()}.`);
  setTimeout(beginMonitoring, delayMs);
}

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

function discordPostReference(channel, message) {
  const guildId = message.guildId || channel.guildId;
  return guildId ? `https://discord.com/channels/${guildId}/${channel.id}/${message.id}` : '';
}

function firstExtractedUnits(packet) {
  const extraction = packet.analysis?.extraction || {};
  const firstPlay = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays[0] : extraction;
  return firstPlay?.units || extraction.units || '';
}

async function postAndLogOfficialPick({ channel, payload, entry }) {
  await appendOfficialPick(entry);
  try {
    const message = await channel.send(payload);
    await updateOfficialPick(entry.pick_id, {
      post_reference: discordPostReference(channel, message),
      status: 'PUBLISHED'
    });
    return message;
  } catch (error) {
    await updateOfficialPick(entry.pick_id, {
      status: 'POST_FAILED',
      notes: `Discord post failed: ${error instanceof Error ? error.message : String(error)}`
    });
    throw error;
  }
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
    if (packet.source?.reuse_permission !== 'CONFIRMED') {
      throw new Error('This source is approved for monitoring only. Use Kobe’s original wording and approved media with /publish-pick until source reuse permission is confirmed.');
    }
    assertPublishableExtraction(packet);
    const sport = normalizedSport(packet);
    const channel = action === 'free'
      ? await approvedTextChannel(freePickChannelId)
      : await approvedTextChannel(sport ? sportChannelMap.get(sport) : undefined);
    const label = action === 'free' ? 'FREE PICK' : 'PAID PICK';
    const extraction = packet.analysis.extraction;
    const firstPlay = Array.isArray(extraction.plays) && extraction.plays.length ? extraction.plays[0] : extraction;
    await postAndLogOfficialPick({
      channel,
      payload: { embeds: [buildSourcePickEmbed(packet, label)] },
      entry: {
        pick_id: packet.pick_id,
        operating_date: pacificOperatingDate(),
        event: extraction.event || '',
        sport: extraction.sport || sport || '',
        league: extraction.league || '',
        market: firstPlay.market || extraction.market || '',
        selection: firstPlay.selection || extraction.selection || '',
        published_line: firstPlay.line || extraction.line || '',
        published_odds_american: firstPlay.odds_american || extraction.odds_american || '',
        units_risked: firstExtractedUnits(packet),
        source_name: extraction.source_capper_name || packet.source.handle || '',
        credit_text: packet.source.credit_line || '',
        approver: interaction.user.id,
        approved_at: approval.decided_at,
        published_by: client.user?.id || '',
        published_at: new Date().toISOString(),
        destination: `#${channel.name || channel.id}`,
        status: 'PUBLISHED',
        result: 'PENDING',
        notes: `Approved from public X source: ${packet.source.post_url || ''}`
      }
    });
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

function canPostSupportInfo(interaction) {
  return interaction.inGuild() && (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
  );
}

function optionsFrom(interaction) {
  const attachment = interaction.options.getAttachment('image');
  return {
    pickNumber: interaction.options.getInteger('pick_number', true),
    sport: interaction.options.getString('sport', true),
    pick: interaction.options.getString('pick', true),
    event: interaction.options.getString('event', true),
    league: interaction.options.getString('league') || '',
    unitsRisked: interaction.options.getNumber('units_risked', true),
    publishedLine: interaction.options.getString('published_line', true),
    publishedOdds: interaction.options.getInteger('published_odds', true),
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
  startXMonitor();
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
    if (!canPostSupportInfo(interaction)) {
      await interaction.editReply('You need the Manage Channels permission to post the support message.');
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
    if (interaction.commandName === 'grade-pick') {
      const result = interaction.options.getString('result', true);
      const source = interaction.options.getString('result_source', true);
      const outcome = interaction.options.getString('outcome') || '';
      const pickId = interaction.options.getString('pick_id', true);
      const updated = await updateOfficialPick(pickId, {
        result,
        status: result === 'PENDING' ? 'PENDING' : 'GRADED',
        score_or_outcome: outcome,
        result_verified_source: source,
        result_verified_at: new Date().toISOString(),
        graded_by: interaction.user.id
      });
      const net = netUnitsFor(updated);
      if (net !== null) await updateOfficialPick(pickId, { net_units: net });
      await interaction.reply({
        ephemeral: true,
        content: `${updated.pick_id} recorded as ${result}. Its recap net units will be calculated from the exact published odds and units risked.`
      });
      return;
    }

    const isRecap = interaction.commandName === 'preview-recap' || interaction.commandName === 'publish-recap';
    const attachment = interaction.options.getAttachment('image');
    if (isRecap) {
      const embeds = buildLogRecapEmbeds({
        date: interaction.options.getString('date', true),
        rows: await readPickLog(),
        summary: interaction.options.getString('summary') || '',
        imageUrl: interaction.options.getString('image_url') || undefined,
        imageAttachmentUrl: attachment?.url
      });
      if (interaction.commandName === 'preview-recap') {
        await interaction.reply({ ephemeral: true, embeds });
        return;
      }
      const channel = await destinationFor(interaction, recapChannelId);
      for (const embed of embeds) await channel.send({ embeds: [embed] });
      await interaction.reply({ ephemeral: true, content: `Published the full ${interaction.options.getString('date', true)} recap to ${channel}.` });
      return;
    }

    const pickOptions = optionsFrom(interaction);
    const pickId = makePickId({ sport: pickOptions.sport, pickNumber: pickOptions.pickNumber });
    const embed = buildPickEmbed({ ...pickOptions, pickId });
    if (interaction.commandName === 'preview-pick') {
      await interaction.reply({ ephemeral: true, embeds: [embed] });
      return;
    }

    const channel = await destinationFor(interaction, defaultChannelId, pickOptions.sport.toLowerCase());
    await postAndLogOfficialPick({
      channel,
      payload: { embeds: [embed] },
      entry: {
        pick_id: pickId,
        operating_date: pacificOperatingDate(),
        event: pickOptions.event,
        sport: pickOptions.sport,
        league: pickOptions.league,
        market: pickOptions.publishedLine,
        selection: pickOptions.pick,
        published_line: pickOptions.publishedLine,
        published_odds_american: pickOptions.publishedOdds,
        units_risked: pickOptions.unitsRisked,
        source_name: pickOptions.sourceUrl || '',
        published_by: interaction.user.id,
        published_at: new Date().toISOString(),
        destination: `#${channel.name || channel.id}`,
        status: 'PUBLISHED',
        result: 'PENDING',
        notes: 'Published with /publish-pick.'
      }
    });
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
