import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { buildLogRecapEmbeds } = require('../bot/lib/recap');
const { reportEmbeds } = require('../bot/lib/espn-trends');

export function runNonPublicContentAcceptance() {
  const recapRows = [
    {
      pick_id: 'PRIVATE-ACCEPTANCE-001', operating_date: '2026-09-13',
      published_at: '2026-09-13T17:00:00.000Z', post_reference: 'fixture://discord/001',
      status: 'GRADED', result: 'W', destination: '#fixture-only', selection: 'Player A',
      published_line: 'OVER 55.5 receiving yards', published_odds_american: '-110',
      units_risked: '1', net_units: '0.91', result_verified_source: 'fixture://espn/final'
    },
    {
      pick_id: 'PRIVATE-ACCEPTANCE-002', operating_date: '2026-09-13',
      published_at: '2026-09-13T17:01:00.000Z', post_reference: 'fixture://discord/002',
      status: 'GRADED', result: 'L', destination: '#fixture-only', selection: 'Team B',
      published_line: '-2.5 spread', published_odds_american: '-105',
      units_risked: '1', net_units: '-1', result_verified_source: 'fixture://espn/final'
    }
  ];
  const recap = buildLogRecapEmbeds({ date: '2026-09-13', rows: recapRows, summary: 'Private fixture—never publish.' });
  const recapText = recap.map((embed) => `${embed.title}\n${embed.description}`).join('\n');
  assert.match(recapText, /Official record:\*\* 1-1-0/);
  assert.match(recapText, /Overall net units:\*\* -0\.09u/);
  assert.match(recapText, /PRIVATE-ACCEPTANCE-001/);
  assert.match(recapText, /PRIVATE-ACCEPTANCE-002/);

  const trends = reportEmbeds({
    league: 'NFL', leagueId: 'nfl', operatingDate: '2026-09-13', generatedAt: '2026-09-13T17:00:00.000Z',
    disclaimer: 'Private research fixture only.',
    sources: { standings: 'https://www.espn.com/fixture/standings', scoreboard: 'https://www.espn.com/fixture/scoreboard' },
    leagueTable: [{ rank: 1, name: 'Away Team', overall: '1-0' }],
    matchups: [{
      name: 'Away Team at Home Team', start: '10:00 AM PDT', status: 'Scheduled', link: '',
      away: { rank: 1, name: 'Away Team', overall: '1-0', road: '1-0', lastTen: '1-0', streak: 'W1' },
      home: { rank: 2, name: 'Home Team', overall: '0-1', home: '0-1', lastTen: '0-1', streak: 'L1' },
      awayPlayerLeaders: [{ label: 'REC', player: 'Player A', value: '8' }], homePlayerLeaders: []
    }]
  });
  const trendsText = trends.map((embed) => `${embed.title}\n${embed.description}`).join('\n');
  assert.match(trendsText, /Private research fixture only/);
  assert.match(trendsText, /ESPN standings/);
  assert.match(trendsText, /Away Team at Home Team/);

  return {
    ok: true,
    mode: 'fixture-only-no-send',
    networkCalls: 0,
    discordPosts: 0,
    emailsSent: 0,
    xPosts: 0,
    recapEmbeds: recap.length,
    trendsEmbeds: trends.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(runNonPublicContentAcceptance(), null, 2));
}
