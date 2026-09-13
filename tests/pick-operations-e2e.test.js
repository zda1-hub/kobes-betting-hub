const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { enrichPacket } = require('../pipeline/enrich-pick');
const { upcomingEventStatus } = require('../bot/lib/event-timing');
const {
  assertFreePickEligible,
  assertPublishableExtraction,
  buildSourcePickApprovalEmbed,
  buildSourcePickEmbed
} = require('../bot/lib/source-review');
const { buildFreePickXPost } = require('../bot/lib/free-pick-x');
const { appendOfficialPick, netUnitsFor, readPickLog, updateOfficialPick } = require('../bot/lib/pick-log');
const { gradePickFromEspn } = require('../bot/lib/espn-grading');
const { buildLogRecapEmbeds } = require('../bot/lib/recap');
const { generateTrendReport, reportEmbeds } = require('../bot/lib/espn-trends');

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('controlled non-public pick lifecycle reaches extraction, approval copy, log, ESPN grade, recap, X copy, and Trends', async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-pick-e2e-'));
  const logPath = path.join(tempDirectory, 'pick-log.csv');
  const originalEnvironment = {
    ENRICHMENT_ENABLED: process.env.ENRICHMENT_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    AUDIT_DATABASE_REQUIRED: process.env.AUDIT_DATABASE_REQUIRED
  };
  process.env.ENRICHMENT_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'non-public-test-key';
  // The acceptance harness must remain side-effect-free even if somebody
  // invokes it from a shell that normally carries production audit settings.
  delete process.env.DATABASE_URL;
  process.env.AUDIT_DATABASE_REQUIRED = 'false';

  const extraction = {
    is_pick_candidate: true,
    source_capper_name: 'Example Capper',
    sport: 'Baseball',
    league: 'MLB',
    event: 'Chicago Cubs at Milwaukee Brewers',
    market: 'Pitcher strikeouts',
    selection: 'Jacob Misiorowski Over 5.5 Strikeouts',
    player_name: 'Jacob Misiorowski',
    line: 'Over 5.5',
    odds_american: '-110',
    units: '1u',
    plays: [{
      selection: 'Jacob Misiorowski Over 5.5 Strikeouts',
      player_name: 'Jacob Misiorowski',
      line: 'Over 5.5',
      odds_american: '-110',
      units: '1u',
      event: 'Chicago Cubs at Milwaukee Brewers'
    }],
    source_claims: [
      'Misiorowski recorded at least six strikeouts in four straight starts',
      'He generated 15 swinging strikes in his previous outing',
      'Chicago struck out 10 times in the prior matchup'
    ],
    image_summary: '',
    missing_or_ambiguous: []
  };
  const packet = {
    pick_id: '20260913-001-X',
    source: {
      handle: 'examplecapper',
      display_name: 'Example Capper',
      post_id: '1001',
      post_url: 'https://x.com/examplecapper/status/1001',
      posted_at: '2026-09-13T15:00:00.000Z',
      publish_mode: 'writeup_review',
      reuse_permission: 'CONFIRMED',
      text: 'Jacob Misiorowski over 5.5 strikeouts -110, 1u',
      media_urls: []
    },
    approval: { decision: null, image_url: null }
  };

  try {
    packet.analysis = await enrichPacket(packet, {
      fetchImpl: async (url, options) => {
        assert.equal(String(url), 'https://api.openai.com/v1/responses');
        assert.equal(options.method, 'POST');
        return new Response(JSON.stringify({
          id: 'response-non-public-e2e',
          output_text: JSON.stringify(extraction),
          usage: { input_tokens: 100, output_tokens: 80, input_tokens_details: { cached_tokens: 0 } }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': 'request-non-public-e2e' }
        });
      }
    });
    assert.equal(packet.analysis.status, 'SOURCE_EXTRACTED');

    const upcomingEvent = {
      id: '401-test',
      date: '2026-09-13T22:10:00.000Z',
      competitions: [{ competitors: [
        { team: { id: '16', displayName: 'Chicago Cubs', shortDisplayName: 'Cubs', abbreviation: 'CHC' } },
        { team: { id: '8', displayName: 'Milwaukee Brewers', shortDisplayName: 'Brewers', abbreviation: 'MIL' } }
      ] }]
    };
    const timing = await upcomingEventStatus(packet, {
      now: new Date('2026-09-13T18:00:00.000Z'),
      fetchImpl: async (url) => {
        if (String(url).includes('/roster')) {
          return jsonResponse({ athletes: [{ items: [{ displayName: String(url).includes('/8/') ? 'Jacob Misiorowski' : 'Ian Happ' }] }] });
        }
        return jsonResponse({ events: [upcomingEvent] });
      }
    });
    assert.equal(timing.status, 'UPCOMING');
    assertPublishableExtraction(packet);
    assertFreePickEligible(packet);

    const approvalPreview = buildSourcePickApprovalEmbed(packet, 'FREE PICK');
    const memberPost = buildSourcePickEmbed(packet, 'FREE PICK');
    assert.deepEqual(approvalPreview, memberPost);
    assert.match(memberPost.description, /^Jacob Misiorowski Over 5\.5 Strikeouts/);

    await appendOfficialPick({
      pick_id: packet.pick_id,
      operating_date: '2026-09-13',
      event: extraction.event,
      sport: extraction.sport,
      league: extraction.league,
      market: extraction.market,
      selection: extraction.selection,
      published_line: extraction.line,
      published_odds_american: extraction.odds_american,
      units_risked: extraction.units,
      source_name: packet.source.display_name,
      approver: 'non-public-test-approver',
      approved_at: '2026-09-13T18:01:00.000Z',
      published_by: 'non-public-test-bot',
      published_at: '2026-09-13T18:02:00.000Z',
      destination: '#non-public-test-channel',
      status: 'PUBLISHING',
      result: 'PENDING'
    }, logPath);
    await updateOfficialPick(packet.pick_id, {
      status: 'PUBLISHED',
      post_reference: 'https://discord.com/channels/test-guild/test-channel/test-message'
    }, logPath);

    const finalEvent = { ...upcomingEvent, status: { type: { completed: true } } };
    const finalSummary = {
      header: { competitions: [{ status: { type: { completed: true } } }] },
      boxscore: { players: [{ statistics: [{
        type: 'pitching',
        keys: ['fullInnings.partInnings', 'strikeouts'],
        athletes: [{ athlete: { displayName: 'Jacob Misiorowski' }, stats: ['6.0', '8'] }]
      }] }] }
    };
    const grade = await gradePickFromEspn((await readPickLog(logPath))[0], {
      fetchImpl: async (url) => jsonResponse(String(url).includes('/summary?') ? finalSummary : { events: [finalEvent] })
    });
    assert.deepEqual(grade, {
      status: 'GRADED',
      result: 'W',
      outcome: 'Jacob Misiorowski: 8 strikeouts',
      source: 'https://www.espn.com/mlb/game/_/gameId/401-test'
    });
    const graded = await updateOfficialPick(packet.pick_id, {
      status: 'GRADED',
      result: grade.result,
      score_or_outcome: grade.outcome,
      result_verified_source: `ESPN final box score: ${grade.source}`,
      result_verified_at: '2026-09-14T02:00:00.000Z',
      graded_by: 'auto:espn'
    }, logPath);
    await updateOfficialPick(packet.pick_id, { net_units: netUnitsFor(graded) }, logPath);
    const recap = buildLogRecapEmbeds({ date: '2026-09-13', rows: await readPickLog(logPath) });
    assert.match(recap[0].description, /\*\*Official record:\*\* 1-0-0/);
    assert.match(recap[0].description, /\*\*Overall net units:\*\* \+0\.91u/);

    assert.equal(buildFreePickXPost(packet), 'FREE PLAY\nJacob Misiorowski Over 5.5 Strikeouts -110 (1u)');

    const standings = { children: [{ standings: { entries: [
      { team: { id: '16', displayName: 'Chicago Cubs' }, stats: [{ name: 'overall', displayValue: '80-63' }, { name: 'winPercent', value: 0.559 }] },
      { team: { id: '8', displayName: 'Milwaukee Brewers' }, stats: [{ name: 'overall', displayValue: '84-59' }, { name: 'winPercent', value: 0.587 }] }
    ] } }] };
    const trendReport = await generateTrendReport({
      league: 'mlb',
      date: '2026-09-13',
      fetchImpl: async (url) => jsonResponse(String(url).includes('/standings?') ? standings : { events: [upcomingEvent] })
    });
    const trendCards = reportEmbeds(trendReport);
    assert.equal(trendReport.matchups.length, 1);
    assert.match(trendCards[0].description, /Research snapshot only/);
  } finally {
    if (originalEnvironment.ENRICHMENT_ENABLED === undefined) delete process.env.ENRICHMENT_ENABLED;
    else process.env.ENRICHMENT_ENABLED = originalEnvironment.ENRICHMENT_ENABLED;
    if (originalEnvironment.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalEnvironment.OPENAI_API_KEY;
    if (originalEnvironment.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
    if (originalEnvironment.AUDIT_DATABASE_REQUIRED === undefined) delete process.env.AUDIT_DATABASE_REQUIRED;
    else process.env.AUDIT_DATABASE_REQUIRED = originalEnvironment.AUDIT_DATABASE_REQUIRED;
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
