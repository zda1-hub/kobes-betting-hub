const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createModelCallBudget,
  configuredMediaOnlyLimit,
  footballGamesScheduledToday,
  footballPriority,
  intakePriority,
  isSinglePlayPacket,
  mediaCaptionHasBetSignal,
  nflGamesScheduledToday,
  recordModelCallDeferral,
  shouldQueueForReview,
  shouldSplitPlayPackets,
  sourceStateAfterPass
} = require('./collect-x');
const { enrichPacket } = require('./enrich-pick');
const { isSupportedSportPick } = require('../bot/lib/event-timing');

test('requires exactly one visible play for each approval card', () => {
  const base = { analysis: { extraction: { plays: [{ selection: 'Player A over 5.5 strikeouts', line: '5.5', odds_american: '-115' }] } } };
  assert.equal(isSinglePlayPacket(base), true);
  assert.equal(isSinglePlayPacket({
    analysis: { extraction: { plays: [
      { selection: 'Player A over 5.5 strikeouts', line: '5.5', odds_american: '-115' },
      { selection: 'Player B over 1.5 hits', line: '1.5', odds_american: '+100' }
    ] } }
  }), false);
});

test('requires a caption signal for generic media while preserving dedicated photo review', () => {
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: '' }, ['https://example.com/pick.png']), false);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'writeup_or_trend' }, { text: 'Tonight\'s ladder card' }, ['https://example.com/ladder.png']), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'photo_review' }, { text: '' }, ['https://example.com/card.png']), true);
});

test('prioritizes strong text picks before signaled and image-only media', () => {
  assert.equal(mediaCaptionHasBetSignal('Tonight\'s betting card'), true);
  assert.equal(mediaCaptionHasBetSignal('Practice photos'), false);
  assert.equal(intakePriority({ monitoring_mode: 'standard' }, { text: 'NFL Rams -4.5 2u' }), 0);
  assert.equal(intakePriority({ monitoring_mode: 'standard' }, { text: 'MLB player over 1.5 hits' }), 1);
  assert.equal(intakePriority({ monitoring_mode: 'writeup_or_trend' }, { text: 'NFL card', attachments: { media_keys: ['1'] } }), 2);
  assert.equal(intakePriority({ monitoring_mode: 'photo_review' }, { text: '', attachments: { media_keys: ['1'] } }), 4);
});

test('bounds weak media candidates per source without changing strong-pick limits', () => {
  assert.equal(configuredMediaOnlyLimit({}), 1);
  assert.equal(configuredMediaOnlyLimit({ X_MONITOR_MAX_MEDIA_ONLY_PER_SOURCE_PER_RUN: '3' }), 3);
  assert.equal(configuredMediaOnlyLimit({ X_MONITOR_MAX_MEDIA_ONLY_PER_SOURCE_PER_RUN: '-1' }), 1);
});

test('sends text-only NFL picks from regular and exclusive sources to extraction', () => {
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: 'NFL Rams -4.5 10u' }, []), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: 'NFL DeMario Douglas 4+ receptions' }, []), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard', publish_mode: 'terms_only' }, { text: 'NFL Matthew Stafford over .5 passing touchdown 4u' }, []), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: 'Patriots practice report and injury news' }, []), false);
});

test('accepts every supported major sport while keeping football explicit', () => {
  for (const [sport, league] of [
    ['Football', 'NFL'],
    ['College Football', 'NCAAF'],
    ['Baseball', 'MLB'],
    ['Basketball', 'NBA'],
    ['Basketball', 'WNBA'],
    ['Hockey', 'NHL'],
    ['Soccer', 'MLS']
  ]) {
    assert.equal(isSupportedSportPick({ analysis: { extraction: { sport, league, event: 'Team A vs Team B' } } }), true, `${sport}/${league}`);
  }
  assert.equal(isSupportedSportPick({ analysis: { extraction: { sport: 'Tennis', league: 'ATP', event: 'Player A vs Player B' } } }), false);
});

test('prioritizes NFL and college-football captions before other sports', () => {
  assert.equal(footballPriority({ text: 'MLB player prop over 1.5 hits' }), 1);
  assert.equal(footballPriority({ text: 'College football player prop over 3.5 receptions' }), 0);
  assert.equal(footballPriority({ text: 'NFL spread -3.5' }), 0);
});

test('preflight detects when the NFL has no games today', async () => {
  const result = await nflGamesScheduledToday({
    now: new Date('2026-09-11T20:09:00.000Z'),
    fetchImpl: async () => ({ ok: true, async json() { return { events: [] }; } })
  });
  assert.equal(result, false);
});

test('preflight allows a college-football slate when the NFL is empty', async () => {
  let calls = 0;
  const result = await footballGamesScheduledToday({
    now: new Date('2026-09-11T20:09:00.000Z'),
    fetchImpl: async () => ({
      ok: true,
      async json() {
        calls += 1;
        return calls === 1 ? { events: [] } : { events: [{ name: 'Ranked college matchup' }] };
      }
    })
  });
  assert.equal(result, true);
});

test('keeps multi-play exclusives grouped while splitting regular posts', () => {
  const packet = {
    source: { publish_mode: 'terms_only' },
    analysis: { extraction: { plays: [{ selection: 'Bet A' }, { selection: 'Bet B' }] } }
  };
  assert.equal(shouldSplitPlayPackets(packet), false);
  assert.equal(shouldSplitPlayPackets({
    ...packet,
    source: { publish_mode: 'writeup_review' }
  }), true);
});

test('one collection run cannot start more OpenAI extraction calls than its model-call cap', async () => {
  const original = {
    enrichment: process.env.ENRICHMENT_ENABLED,
    apiKey: process.env.OPENAI_API_KEY,
    dailyRequests: process.env.OPENAI_DAILY_REQUEST_LIMIT,
    monthlyRequests: process.env.OPENAI_MONTHLY_REQUEST_LIMIT,
    dailyUsd: process.env.OPENAI_DAILY_BUDGET_USD,
    monthlyUsd: process.env.OPENAI_MONTHLY_BUDGET_USD
  };
  process.env.ENRICHMENT_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-only-key';
  delete process.env.OPENAI_DAILY_REQUEST_LIMIT;
  delete process.env.OPENAI_MONTHLY_REQUEST_LIMIT;
  delete process.env.OPENAI_DAILY_BUDGET_USD;
  delete process.env.OPENAI_MONTHLY_BUDGET_USD;

  const budget = createModelCallBudget(2);
  let providerCalls = 0;
  const extraction = {
    is_pick_candidate: false,
    source_capper_name: '',
    sport: '',
    league: '',
    event: '',
    market: '',
    selection: '',
    player_name: '',
    line: '',
    odds_american: '',
    units: '',
    plays: [],
    source_claims: [],
    image_summary: '',
    missing_or_ambiguous: []
  };
  const fetchImpl = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({
      id: `response-${providerCalls}`,
      output_text: JSON.stringify(extraction),
      usage: { input_tokens: 20, output_tokens: 10, input_tokens_details: { cached_tokens: 0 } }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': `request-${providerCalls}` }
    });
  };

  try {
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => enrichPacket({
      pick_id: `TEST-${index}`,
      source: {
        handle: 'testsource',
        post_id: String(index + 1),
        post_url: `https://x.com/testsource/status/${index + 1}`,
        posted_at: '2026-09-12T18:00:00.000Z',
        text: 'NFL test pick over 1.5 yards',
        media_urls: []
      }
    }, {
      beforeOpenAIRequest: () => budget.tryStart(),
      fetchImpl
    })));

    assert.equal(providerCalls, 2);
    assert.equal(budget.started, 2);
    assert.equal(results.filter((result) => result.status === 'SOURCE_EXTRACTED').length, 2);
    assert.equal(results.filter((result) => result.status === 'MODEL_CALL_LIMIT_REACHED').length, 3);
  } finally {
    for (const [key, value] of [
      ['ENRICHMENT_ENABLED', original.enrichment],
      ['OPENAI_API_KEY', original.apiKey],
      ['OPENAI_DAILY_REQUEST_LIMIT', original.dailyRequests],
      ['OPENAI_MONTHLY_REQUEST_LIMIT', original.monthlyRequests],
      ['OPENAI_DAILY_BUDGET_USD', original.dailyUsd],
      ['OPENAI_MONTHLY_BUDGET_USD', original.monthlyUsd]
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('model-call deferrals are audited and logged without advancing the source cursor', async () => {
  const decisions = [];
  const logs = [];
  const counts = await recordModelCallDeferral({ pick_id: 'DEFERRED-1' }, {
    sourceHandle: 'prioritysource',
    postId: '250',
    recordDecision: async (_packet, decision) => decisions.push(decision),
    logger: (message) => logs.push(message)
  });
  const nextState = sourceStateAfterPass({
    sourceState: { since_id: '100', handled_post_ids: ['150'] },
    userId: 'source-user',
    date: '2026-09-12',
    lastProcessedId: '300',
    handledPostIds: new Set(['150', '200']),
    completedSourcePass: false,
    rescanImages: true,
    rescanUpcomingSlate: true
  });

  assert.deepEqual(counts, { skipped: 1, deferred: 1 });
  assert.deepEqual(decisions, [{
    code: 'MODEL_CALL_LIMIT_REACHED',
    reason: 'The per-run OpenAI extraction-call limit was reached before this candidate.',
    status: 'DEFERRED'
  }]);
  assert.match(logs[0], /Deferred @prioritysource post 250/);
  assert.equal(nextState.since_id, '100');
  assert.deepEqual(nextState.handled_post_ids, ['150', '200']);
  assert.equal(nextState.handled_post_ids.includes('250'), false);
  assert.equal(nextState.catchup_date, undefined);
  assert.equal(nextState.image_rescan_version, 'source-routing-image-rescan-v3');
  assert.equal(nextState.upcoming_slate_rescan_version, 'upcoming-slate-rescan-v1');
});
