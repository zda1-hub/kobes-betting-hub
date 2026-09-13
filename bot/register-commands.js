require('dotenv').config();

const { REST, Routes } = require('discord.js');
const commands = require('./commands');
const { attachDiscordRestAudit } = require('../pipeline/api-client');

for (const name of ['DISCORD_TOKEN', 'DISCORD_APPLICATION_ID']) {
  if (!process.env[name]) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const restAudit = attachDiscordRestAudit(rest, {
  callerComponent: 'bot/register-commands',
  triggerType: 'command_registration'
});
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID);

(async () => {
  try {
    await rest.put(route, { body: commands });
    console.log(process.env.DISCORD_GUILD_ID ? 'Registered guild commands.' : 'Registered global commands.');
  } finally {
    await restAudit.flush();
    restAudit.detach();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
