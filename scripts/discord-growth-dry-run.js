const { createDiscordGrowth } = require('../bot/lib/discord-growth');
const at = new Date('2026-11-27T06:55:00Z'); // Nov 26, 11:55 PM Phoenix
const job = createDiscordGrowth({
  guildId: '1215407647155683358', discordToken: 'mock',
  publisherUrl: 'https://mock.invalid', publisherSecret: 'mock',
  fetchImpl: async url => {
    if (url.includes('with_counts=true')) return Response.json({ approximate_member_count: 1326, approximate_presence_count: 248 });
    if (url.endsWith('/invites')) return Response.json([
      { code: 'sB9vzGz2xj', uses: 82, channel: { name: 'start-here' } },
      { code: 'exampleIG', uses: 4, channel: { name: 'general' } }
    ]);
    throw new Error('Dry run attempted a write');
  }
});
job.tick({ at, dryRun: true }).then(receipt => console.log(JSON.stringify(receipt, null, 2)));
