// Run with --dry-run first. --apply is reserved for the approved live-server change.
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { inspectWelcome, applyWelcome } = require('./lib/member-welcome');

const mode = process.argv[2];
if (!['--dry-run', '--apply'].includes(mode)) throw new Error('Use --dry-run or --apply.');
if (mode === '--apply' && process.env.WELCOME_SETUP_APPROVED !== 'true')
  throw new Error('Set WELCOME_SETUP_APPROVED=true only after the owner approves the reviewed dry run.');
if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_GUILD_ID)
  throw new Error('DISCORD_TOKEN and DISCORD_GUILD_ID are required.');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const plan = await inspectWelcome(guild);
    console.log(JSON.stringify({ mode, guildId: guild.id, ...plan.planned }, null, 2));
    if (mode === '--apply') console.log(JSON.stringify(await applyWelcome(plan), null, 2));
  } catch (error) {
    console.error(`Welcome setup held: ${error.message}`);
    process.exitCode = 1;
  } finally { client.destroy(); }
});
client.login(process.env.DISCORD_TOKEN).catch(error => { console.error(error.message); process.exitCode = 1; });
