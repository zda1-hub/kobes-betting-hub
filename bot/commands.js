const { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, ChannelType, PermissionFlagsBits } = require('discord.js');

const sports = [
  ['football', 'Football (NFL / college)'],
  ['baseball', 'Baseball (MLB)'],
  ['basketball', 'Basketball (NBA / WNBA / college)'],
  ['hockey', 'Hockey (NHL)'],
  ['soccer', 'Soccer (MLS)']
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
  .addIntegerOption((option) => option
    .setName('published_odds')
    .setDescription('Exact source American odds, any price; omit if not provided')
    .setRequired(false))
  .addStringOption((option) => option
    .setName('league')
    .setDescription('League, such as NFL, NCAAF, MLB, NBA, NHL, or MLS')
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
  new ContextMenuCommandBuilder()
    .setName('Edit writeup')
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName('Share to free plays')
    .setType(ApplicationCommandType.Message),
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
      .setDescription('Queue verified writeup and exclusive recap cards for Kobe’s approval')
  ),
  gradePickOptions,
  new SlashCommandBuilder()
    .setName('approve-calendar-post')
    .setDescription('Approve one verified Pacific-time X post and Instagram Story')
    .addStringOption(option => option.setName('date').setDescription('Pacific date, YYYY-MM-DD').setRequired(true).setMinLength(10).setMaxLength(10))
    .addStringOption(option => option.setName('slot').setDescription('Approved calendar slot, Pacific time').setRequired(true).addChoices(
      { name: 'Monday 9 AM · verified recap', value: 'mon0900' },
      { name: 'Monday 3 PM · arbitrage', value: 'mon1500' },
      { name: 'Monday 6:30 PM · member review', value: 'mon1830' },
      { name: 'Tuesday 3 PM · research', value: 'tue1500' },
      { name: 'Tuesday 7 PM · member review', value: 'tue1900' },
      { name: 'Wednesday 9 AM · bankroll', value: 'wed0900' },
      { name: 'Wednesday 2:30 PM · education', value: 'wed1430' },
      { name: 'Wednesday 6 PM · VIP CTA', value: 'wed1800' },
      { name: 'Thursday 3:30 PM · arbitrage', value: 'thu1530' },
      { name: 'Thursday 7:30 PM · member review', value: 'thu1930' },
      { name: 'Friday 9 AM · education', value: 'fri0900' },
      { name: 'Friday 3 PM · VIP tease', value: 'fri1500' },
      { name: 'Friday 7 PM · recap or review', value: 'fri1900' },
      { name: 'Saturday 3 PM · arbitrage', value: 'sat1500' },
      { name: 'Saturday 6:30 PM · settled slips', value: 'sat1830' },
      { name: 'Sunday 11:30 AM · VIP tease', value: 'sun1130' },
      { name: 'Sunday 8:30 PM · recap or review', value: 'sun2030' }
    ))
    .addStringOption(option => option.setName('x_text').setDescription('Exact approved public X copy').setRequired(true).setMaxLength(280))
    .addAttachmentOption(option => option.setName('story_image').setDescription('Approved 1080 × 1920 JPEG for the X post and Story').setRequired(true))
    .addStringOption(option => option.setName('evidence').setDescription('Source/consent reference for the internal receipt').setRequired(true).setMaxLength(1000))
    .addBooleanOption(option => option.setName('rights_confirmed').setDescription('I verified facts, image rights and any member consent').setRequired(true)),
  new SlashCommandBuilder()
    .setName('calendar-status')
    .setDescription('Check X and Instagram receipts for approved calendar slots'),
  new SlashCommandBuilder()
    .setName('edit-calendar-caption')
    .setDescription('Edit an approved calendar X caption before either platform starts publishing')
    .addStringOption(option => option.setName('post_id').setDescription('Calendar ID, for example cal-20261111-wed0900').setRequired(true))
    .addStringOption(option => option.setName('x_text').setDescription('Replacement X caption with the free Discord link').setRequired(true).setMaxLength(280))
    .addBooleanOption(option => option.setName('reviewed').setDescription('I reviewed the replacement copy and its claims').setRequired(true)),
  trendOptions(
    new SlashCommandBuilder()
      .setName('preview-trends')
      .setDescription('Privately preview an ESPN research trends sheet')
  ),
  trendOptions(
    new SlashCommandBuilder()
      .setName('publish-trends')
      .setDescription('Post an ESPN research trends sheet to its approved trends channel')
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
  ,
  new SlashCommandBuilder()
    .setName('hub-status')
    .setDescription('Privately check pick monitoring, logging, grading, and recap readiness'),
  new SlashCommandBuilder()
    .setName('trends-dashboard')
    .setDescription('Open the private VIP Trends-tool search and matchup boards'),
  new SlashCommandBuilder()
    .setName('prop').setDescription('Private bulk search for today’s games; VIP results by DM'),
  new SlashCommandBuilder()
    .setName('sports').setDescription('Owner/admin: control Trends-tool sports privately')
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName('player').setDescription('View a college player’s cached completed games')
    .addStringOption(option => option.setName('sport').setDescription('College sport').setRequired(true).addChoices(
      { name: 'NCAA Football', value: 'cfb' }, { name: 'NCAA Basketball', value: 'cbb' }))
    .addStringOption(option => option.setName('player').setDescription('Exact player name or source ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('matchup').setDescription('Compare cached college team game-log coverage')
    .addStringOption(option => option.setName('sport').setDescription('College sport').setRequired(true).addChoices(
      { name: 'NCAA Football', value: 'cfb' }, { name: 'NCAA Basketball', value: 'cbb' }))
    .addStringOption(option => option.setName('team').setDescription('First exact team name').setRequired(true))
    .addStringOption(option => option.setName('opponent').setDescription('Second exact team name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ladder').setDescription('Compare college historical thresholds')
    .addStringOption(option => option.setName('sport').setDescription('College sport').setRequired(true).addChoices(
      { name: 'NCAA Football', value: 'cfb' }, { name: 'NCAA Basketball', value: 'cbb' }))
    .addStringOption(option => option.setName('player').setDescription('Exact player name or source ID').setRequired(true))
    .addStringOption(option => option.setName('stat').setDescription('Statistic').setRequired(true).addChoices(
      { name: 'Passing yards', value: 'passing_yards' }, { name: 'Rushing yards', value: 'rushing_yards' },
      { name: 'Receiving yards', value: 'receiving_yards' }, { name: 'Receptions', value: 'receptions' },
      { name: 'Rushing + receiving yards', value: 'rush_receiving_yards' },
      { name: 'Anytime touchdown', value: 'anytime_touchdown' },
      { name: 'Points', value: 'points' }, { name: 'Rebounds', value: 'rebounds' },
      { name: 'Assists', value: 'assists' }, { name: '3PM', value: 'threes' },
      { name: 'PRA', value: 'pra' }))
    .addNumberOption(option => option.setName('line_1').setDescription('First historical threshold').setRequired(true).setMinValue(0))
    .addNumberOption(option => option.setName('line_2').setDescription('Second historical threshold').setRequired(true).setMinValue(0))
    .addNumberOption(option => option.setName('line_3').setDescription('Optional third threshold').setMinValue(0)),
  new SlashCommandBuilder()
    .setName('trends-test-nfl')
    .setDescription('Admin only: post, verify and delete one real NFL test card')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('trends-test-feed')
    .setDescription('Admin only: post one private daily-feed TEST for review')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(option => option.setName('sport').setDescription('Current sport')
      .setRequired(true).addChoices({ name: 'NBA', value: 'NBA' }, { name: 'NFL', value: 'NFL' },
        { name: 'CFB', value: 'CFB' }, { name: 'CBB', value: 'CBB' })),
  new SlashCommandBuilder()
    .setName('trends-board')
    .setDescription('Browse a private NBA matchup board with current alternate props')
    .addStringOption(option => option.setName('team').setDescription('Team in the upcoming matchup').setRequired(true).setMinLength(3).setMaxLength(80))
    .addStringOption(option => option.setName('stat').setDescription('Filter the statistic').addChoices(
      { name: 'All three', value: 'all' }, { name: 'Points', value: 'points' },
      { name: 'Rebounds', value: 'rebounds' }, { name: 'Assists', value: 'assists' }))
    .addIntegerOption(option => option.setName('minimum').setDescription('Minimum current-season historical hit rate').addChoices(
      { name: '80%', value: 80 }, { name: '85%', value: 85 },
      { name: '90%', value: 90 }, { name: '95%', value: 95 })),
  new SlashCommandBuilder()
    .setName('trends-board-other')
    .setDescription('Browse current NFL, NHL or MLB prop research by matchup')
    .addStringOption(option => option.setName('sport').setDescription('League').setRequired(true).addChoices(
      { name: 'NFL', value: 'NFL' }, { name: 'NHL', value: 'NHL' }, { name: 'MLB', value: 'MLB' }))
    .addStringOption(option => option.setName('team').setDescription('Team in the upcoming matchup').setRequired(true).setMinLength(3).setMaxLength(80))
    .addIntegerOption(option => option.setName('minimum').setDescription('Minimum current-season historical hit rate').addChoices(
      { name: '80%', value: 80 }, { name: '85%', value: 85 },
      { name: '90%', value: 90 }, { name: '95%', value: 95 })),
  new SlashCommandBuilder()
    .setName('trends-builder')
    .setDescription('Open your private NBA research combination builder'),
  new SlashCommandBuilder()
    .setName('trends-player')
    .setDescription('Open a verified NBA player profile in the VIP channel')
    .addStringOption(option => option.setName('team').setDescription('Current NBA team').setRequired(true).setMinLength(3).setMaxLength(80))
    .addStringOption(option => option.setName('player').setDescription('Full player name; accents optional').setRequired(true).setMinLength(3).setMaxLength(100)),
  new SlashCommandBuilder()
    .setName('trends-team')
    .setDescription('Open an NBA team roster, injury and recent-results profile')
    .addStringOption(option => option.setName('team').setDescription('Full team name or abbreviation').setRequired(true).setMinLength(2).setMaxLength(80)),
  new SlashCommandBuilder()
    .setName('trends-nba')
    .setDescription('Browse current NBA alternate lines and verified historical counts')
    .addStringOption(option => option.setName('team').setDescription('Team in the upcoming matchup').setRequired(true).setMinLength(3).setMaxLength(80))
    .addStringOption(option => option.setName('player').setDescription('Full player name; accents optional').setRequired(true).setMinLength(3).setMaxLength(100))
    .addStringOption(option => option.setName('stat').setDescription('Player statistic').setRequired(true).addChoices(
      { name: 'Points', value: 'points' }, { name: 'Rebounds', value: 'rebounds' }, { name: 'Assists', value: 'assists' }))
    .addStringOption(option => option.setName('side').setDescription('Market side; defaults to Over').addChoices(
      { name: 'Over', value: 'over' }, { name: 'Under', value: 'under' }))
    .addNumberOption(option => option.setName('line').setDescription('Optional exact line; omit to browse available lines').setMinValue(0).setMaxValue(1000)),
  new SlashCommandBuilder()
    .setName('trends-live')
    .setDescription('Research a current NFL, NHL or MLB prop in the private Trends-tool')
    .addStringOption(option => option.setName('sport').setDescription('League').setRequired(true).addChoices(
      { name: 'NFL', value: 'NFL' }, { name: 'NHL', value: 'NHL' }, { name: 'MLB', value: 'MLB' }))
    .addStringOption(option => option.setName('team').setDescription('Team in the upcoming matchup').setRequired(true).setMinLength(3).setMaxLength(80))
    .addStringOption(option => option.setName('player').setDescription('Full player name').setRequired(true).setMinLength(3).setMaxLength(100))
    .addStringOption(option => option.setName('stat').setDescription('Stat supported for this league').setRequired(true).addChoices(
      { name: 'NFL receptions', value: 'receptions' },
      { name: 'NFL receiving yards', value: 'receiving_yards' },
      { name: 'NFL rushing yards', value: 'rushing_yards' },
      { name: 'NHL shots on goal', value: 'shots_on_goal' },
      { name: 'NHL points', value: 'points' },
      { name: 'MLB hits', value: 'hits' }))
    .addNumberOption(option => option.setName('line').setDescription('Optional exact line; omit to browse available lines').setMinValue(0).setMaxValue(1000)),
  new SlashCommandBuilder()
    .setName('trends-nfl')
    .setDescription('Research completed NFL player games in the VIP Trends-tool channel')
    .addStringOption(option => option.setName('player').setDescription('Full player name').setRequired(true).setMinLength(3).setMaxLength(100))
    .addStringOption(option => option.setName('stat').setDescription('Historical player statistic').setRequired(true).addChoices(
      { name: 'Receptions', value: 'receptions' },
      { name: 'Receiving yards', value: 'receiving_yards' },
      { name: 'Rushing yards', value: 'rushing_yards' },
      { name: 'Rushing attempts', value: 'rushing_attempts' },
      { name: 'Passing yards', value: 'passing_yards' },
      { name: 'Passing touchdowns', value: 'passing_touchdowns' }
    ))
    .addStringOption(option => option.setName('side').setDescription('How to compare the stat with the line').setRequired(true).addChoices(
      { name: 'Over', value: 'over' }, { name: 'Under', value: 'under' }, { name: 'At least', value: 'at_least' }
    ))
    .addNumberOption(option => option.setName('line').setDescription('Stat threshold; this is your research input, not a live sportsbook quote').setRequired(true).setMinValue(0).setMaxValue(1000))
    .addNumberOption(option => option.setName('alternate_1').setDescription('Optional second historical threshold; not a live sportsbook line').setMinValue(0).setMaxValue(1000))
    .addNumberOption(option => option.setName('alternate_2').setDescription('Optional third historical threshold; not a live sportsbook line').setMinValue(0).setMaxValue(1000)),
  new SlashCommandBuilder()
    .setName('trends-research')
    .setDescription('Privately research NBA, NHL or MLB historical player stats')
    .addStringOption(option => option.setName('sport').setDescription('League').setRequired(true).addChoices(
      { name: 'NBA', value: 'NBA' }, { name: 'NHL', value: 'NHL' }, { name: 'MLB', value: 'MLB' }
    ))
    .addStringOption(option => option.setName('player').setDescription('Exact name shown by the source').setRequired(true).setMinLength(3).setMaxLength(100))
    .addStringOption(option => option.setName('stat').setDescription('Choose a stat supported by the selected league').setRequired(true).addChoices(
      { name: 'Points', value: 'points' }, { name: 'Rebounds', value: 'rebounds' },
      { name: 'Assists', value: 'assists' }, { name: 'Threes', value: 'threes' },
      { name: 'Points + assists', value: 'points_assists' }, { name: 'Goals', value: 'goals' },
      { name: 'Shots on goal', value: 'shots_on_goal' }, { name: 'Hits', value: 'hits' },
      { name: 'Blocked shots', value: 'blocked_shots' }, { name: 'Home runs', value: 'home_runs' },
      { name: 'Runs batted in', value: 'runs_batted_in' }
    ))
    .addStringOption(option => option.setName('side').setDescription('Historical threshold comparison').setRequired(true).addChoices(
      { name: 'Over', value: 'over' }, { name: 'Under', value: 'under' }, { name: 'At least', value: 'at_least' }
    ))
    .addNumberOption(option => option.setName('line').setDescription('Your research threshold, not a sportsbook quote').setRequired(true).setMinValue(0).setMaxValue(1000))
    .addStringOption(option => option.setName('team').setDescription('NHL or NBA team abbreviation to resolve identical names').setMaxLength(4)),
  new SlashCommandBuilder()
    .setName('trends-market')
    .setDescription('Privately compare one current alternate prop with sourced historical counts')
    .addStringOption(option => option.setName('sport').setDescription('League').setRequired(true).addChoices(
      { name: 'NBA', value: 'NBA' }, { name: 'NFL', value: 'NFL' }, { name: 'NHL', value: 'NHL' }, { name: 'MLB', value: 'MLB' }))
    .addStringOption(option => option.setName('team').setDescription('Team name in the upcoming matchup').setRequired(true).setMinLength(3).setMaxLength(80))
    .addStringOption(option => option.setName('player').setDescription('Full name shown by the odds board').setRequired(true).setMinLength(3).setMaxLength(100))
    .addStringOption(option => option.setName('stat').setDescription('Supported stat for this sport').setRequired(true).addChoices(
      { name: 'Points', value: 'points' }, { name: 'Rebounds', value: 'rebounds' },
      { name: 'Assists', value: 'assists' }, { name: 'Receptions', value: 'receptions' },
      { name: 'Receiving yards', value: 'receiving_yards' }, { name: 'Rushing yards', value: 'rushing_yards' },
      { name: 'Shots on goal', value: 'shots_on_goal' }, { name: 'Hits', value: 'hits' }))
    .addStringOption(option => option.setName('side').setDescription('Market side').setRequired(true).addChoices(
      { name: 'Over', value: 'over' }, { name: 'Under', value: 'under' }))
    .addNumberOption(option => option.setName('line').setDescription('Exact alternate line to research').setRequired(true).setMinValue(0).setMaxValue(1000)),
  new SlashCommandBuilder()
    .setName('trends-combo')
    .setDescription('Privately register interest in an exact 2–4-leg research combination')
    .addStringOption(option => option.setName('leg_1').setDescription('SPORT|TEAM|PLAYER|STAT|OVER/UNDER|LINE').setRequired(true).setMaxLength(240))
    .addStringOption(option => option.setName('leg_2').setDescription('SPORT|TEAM|PLAYER|STAT|OVER/UNDER|LINE').setRequired(true).setMaxLength(240))
    .addStringOption(option => option.setName('leg_3').setDescription('Optional third exact leg').setMaxLength(240))
    .addStringOption(option => option.setName('leg_4').setDescription('Optional fourth exact leg').setMaxLength(240)),
  new SlashCommandBuilder()
    .setName('pick-audit')
    .setDescription('Privately inspect the database timeline for one pick or X post')
    .addStringOption((option) => option
      .setName('identifier')
      .setDescription('Exact Pick ID or original X post URL')
      .setRequired(true)
      .setMaxLength(1000))
].map((command) => command.toJSON());
