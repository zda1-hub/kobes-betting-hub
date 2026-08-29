require('dotenv').config();

const { generateTrendReport, reportEmbeds, saveTrendReport } = require('../bot/lib/espn-trends');

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

async function main() {
  const league = option('league', 'mlb');
  const date = option('date');
  if (!date) throw new Error('Use --date YYYY-MM-DD.');
  const report = await generateTrendReport({ league, date });
  const output = await saveTrendReport(report);
  const matchups = report.matchups.length;
  console.log(`Saved ${report.league} research sheet (${report.leagueTable.length} teams, ${matchups} event(s)) to ${output}`);
  console.log(`Discord-ready embeds: ${reportEmbeds(report).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
