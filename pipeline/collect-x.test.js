const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalOddsEligible,
  basketballPriority,
  candidateEventTiming,
  createModelCallBudget,
  createSourceModelCallReservation,
  configuredMediaOnlyLimit,
  configuredPerSourceModelCallLimit,
  footballGamesScheduledToday,
  footballPriority,
  heldExpertTermsCandidate,
  heldMonitoredXCandidate,
  intakePriority,
  isSinglePlayPacket,
  mediaCaptionHasBetSignal,
  monitoredTextExtraction,
  nbaGamesScheduledToday,
  nflGamesScheduledToday,
  notifyApprovalChannel,
  packetApprovalOddsEligible,
  recordModelCallDeferral,
  rotateSources,
  shouldQueueForReview,
  shouldSplitPlayPackets,
  sourceSupportSignalCount,
  sourceStateAfterPass
} = require('./collect-x');
const { enrichPacket } = require('./enrich-pick');
const { isSupportedSportPick } = require('../bot/lib/event-timing');

test('exclusive cards do not require odds; regular picks retain the price gate', () => {
  for (const odds of ['-199', '-110', '+100', '+250']) assert.equal(approvalOddsEligible({ odds_american: odds }), true, odds);
  for (const odds of ['-200', '-201', '', 'EVEN', '3.5']) assert.equal(approvalOddsEligible({ odds_american: odds }), false, odds);
  const packet = { pick_id: 'odds-test', approval_number: 1, approval: {},
    source: { publish_mode: 'terms_only' },
    analysis: { extraction: { plays: [{ selection: 'A', odds_american: '-110' }, { selection: 'B', odds_american: '-250' }] } } };
  assert.equal(packetApprovalOddsEligible(packet), true);
  packet.analysis.extraction.plays[1].odds_american = '';
  assert.equal(packetApprovalOddsEligible(packet), true);
  packet.source.publish_mode = 'writeup_review';
  assert.equal(packetApprovalOddsEligible(packet), false);
});

test('recovers only a current held X wager with a clear expert selection', () => {
  const packet = {
    pick_id: '20261022-143-01-X', status: 'HELD_NOT_READY', approval: {},
    source: { platform: 'Twitter/X', publish_mode: 'writeup_review', reuse_permission: 'NOT_CONFIRMED',
      posted_at: '2026-10-22T16:00:00.000Z' },
    analysis: { status: 'SOURCE_EXTRACTED', extraction: {
      is_pick_candidate: true, sport: 'Basketball', league: 'NBA', event: 'Celtics at Knicks',
      plays: [{ selection: 'Jayson Tatum OVER 5.5 assists -115', player_name: 'Jayson Tatum',
        market: 'assists', odds_american: '-115' }], source_claims: []
    } },
    verification: { event_start: '2026-10-23T01:00:00.000Z' }
  };
  const now = new Date('2026-10-22T17:00:00.000Z');
  assert.equal(heldMonitoredXCandidate(packet, '2026-10-22', now), true);
  assert.equal(heldMonitoredXCandidate({ ...packet, discord_review_message_id: 'sent' }, '2026-10-22', now), false);
  assert.equal(heldMonitoredXCandidate({ ...packet, analysis: { ...packet.analysis, extraction: {
    ...packet.analysis.extraction, plays: [{ ...packet.analysis.extraction.plays[0], odds_american: '' }]
  } } }, '2026-10-22', now), true);
  assert.equal(heldMonitoredXCandidate({ ...packet, verification: { event_start: '2026-10-22T16:30:00.000Z' } }, '2026-10-22', now), false);
  assert.equal(heldMonitoredXCandidate({ ...packet, source: { ...packet.source, posted_at: '2026-10-21T16:00:00.000Z' } }, '2026-10-22', now), false);
});

test('recovers only today’s unsent terms-only X card before the event', () => {
  const packet = { pick_id: '20261022-143-01-X', status: 'HELD_NOT_READY', approval: {},
    source: { platform: 'Twitter/X', publish_mode: 'terms_only', posted_at: '2026-10-22T16:00:00.000Z' },
    verification: { event_start: '2026-10-23T01:00:00.000Z' } };
  const now = new Date('2026-10-22T17:00:00.000Z');
  assert.equal(heldExpertTermsCandidate(packet, '2026-10-22', now), true);
  assert.equal(heldExpertTermsCandidate({ ...packet, discord_review_message_id: 'sent' }, '2026-10-22', now), false);
  assert.equal(heldExpertTermsCandidate({ ...packet, verification: { event_start: '2026-10-22T16:30:00.000Z' } }, '2026-10-22', now), false);
  assert.equal(heldExpertTermsCandidate({ ...packet, source: { ...packet.source, posted_at: '2026-10-21T16:00:00.000Z' } }, '2026-10-22', now), false);
});

test('a complete monitored X wager uses the exact expert card and paid-only control', async () => {
  const before = { token: process.env.DISCORD_TOKEN, standard: process.env.PICK_APPROVAL_CHANNEL_ID,
    exclusive: process.env.EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID, expert: process.env.EXPERT_PICKS_CHANNEL_ID,
    fetch: global.fetch };
  process.env.DISCORD_TOKEN = 'test-token';
  process.env.PICK_APPROVAL_CHANNEL_ID = 'standard-approvals';
  process.env.EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID = 'exclusive-approvals';
  process.env.EXPERT_PICKS_CHANNEL_ID = 'expert-vip';
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(options.method === 'POST' ? { id: 'review-123' } : { name: 'expert-picks' }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const packet = {
    pick_id: '20261022-143-01-X', approval_number: 143, status: 'ELIGIBLE', approval: {},
    source: { platform: 'Twitter/X', post_id: '123', post_url: 'https://x.com/example/status/123',
      posted_at: '2026-10-22T16:00:00.000Z', handle: 'example', text: 'NBA pick',
      publish_mode: 'writeup_review', reuse_permission: 'NOT_CONFIRMED' },
    analysis: { status: 'SOURCE_EXTRACTED', extraction: { is_pick_candidate: true, sport: 'Basketball', league: 'NBA',
      event: 'Celtics at Knicks', plays: [{ selection: 'Jayson Tatum OVER 5.5 assists -115',
        player_name: 'Jayson Tatum', market: 'assists', odds_american: '-115' }], source_claims: [] } }
  };
  try {
    assert.equal(await notifyApprovalChannel(packet), 'review-123');
    assert.equal(packet.source.publish_mode, 'monitored_terms');
    const sent = calls.find(call => call.url.endsWith('/channels/exclusive-approvals/messages'));
    assert.ok(sent);
    const payload = JSON.parse(sent.options.body);
    assert.equal(payload.embeds[0].description, '@example\n• Jayson Tatum OVER 5.5 assists -115');
    assert.equal(payload.components[0].components.some(button => button.custom_id?.endsWith(':free')), false);
    assert.equal(payload.components[0].components.find(button => button.custom_id?.endsWith(':paid')).label, 'Post to #expert-picks');
    const unpriced = structuredClone(packet);
    unpriced.pick_id = '20261022-144-01-X';
    unpriced.status = 'ELIGIBLE';
    unpriced.analysis.extraction.plays[0].selection = 'Jayson Tatum OVER 5.5 assists';
    unpriced.analysis.extraction.plays[0].odds_american = '';
    assert.equal(await notifyApprovalChannel(unpriced), 'review-123');
    const unpricedSend = calls.filter(call => call.url.endsWith('/channels/exclusive-approvals/messages')).at(-1);
    assert.equal(JSON.parse(unpricedSend.options.body).embeds[0].description,
      '@example\n• Jayson Tatum OVER 5.5 assists');
  } finally {
    global.fetch = before.fetch;
    for (const [key, value] of [['DISCORD_TOKEN', before.token], ['PICK_APPROVAL_CHANNEL_ID', before.standard],
      ['EXCLUSIVE_PICK_APPROVAL_CHANNEL_ID', before.exclusive], ['EXPERT_PICKS_CHANNEL_ID', before.expert]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('holds a zero-fact writeup before any Discord approval request', async () => {
  const before = { token: process.env.DISCORD_TOKEN, channel: process.env.PICK_APPROVAL_CHANNEL_ID, fetch: global.fetch };
  process.env.DISCORD_TOKEN = 'test-token';
  process.env.PICK_APPROVAL_CHANNEL_ID = '123';
  global.fetch = async () => { throw new Error('Incomplete approval reached Discord'); };
  try {
    const packet = {
      pick_id: '20260927-143-01-X', approval_number: 143, approval: {},
      source: { publish_mode: 'writeup', reuse_permission: 'CONFIRMED' },
      analysis: { status: 'SOURCE_EXTRACTED', extraction: {
        is_pick_candidate: true, selection: 'Denver Broncos +7.5', event: 'Rams @ Broncos', source_claims: []
      } }
    };
    assert.equal(await notifyApprovalChannel(packet), null);
    assert.equal(packet.status, 'HELD_NOT_READY');
    assert.equal(packet.approval_ready, false);
    assert.match(packet.hold_reason, /4–8/);
  } finally {
    global.fetch = before.fetch;
    if (before.token === undefined) delete process.env.DISCORD_TOKEN;
    else process.env.DISCORD_TOKEN = before.token;
    if (before.channel === undefined) delete process.env.PICK_APPROVAL_CHANNEL_ID;
    else process.env.PICK_APPROVAL_CHANNEL_ID = before.channel;
  }
});

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
  assert.equal(shouldQueueForReview({ monitoring_mode: 'trend_only' }, { text: 'Troy +2.5, 20–5 ATS' }, []), false);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'standard' }, { text: '' }, ['https://example.com/pick.png']), false);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'writeup_or_trend' }, { text: 'Tonight\'s ladder card' }, ['https://example.com/ladder.png']), true);
  assert.equal(shouldQueueForReview({ monitoring_mode: 'photo_review' }, { text: '' }, ['https://example.com/card.png']), true);
});

test('recognizes priced o-line shorthand in a multi-sport picks post', () => {
  const post = { text: "Peaky's Picks 10/22\n- D'Andre Swift o14.5 Rush Attempts (-110)\n- Aaron Gordon o5.5 Rebounds (-120)",
    attachments: { media_keys: ['photo'] } };
  assert.equal(shouldQueueForReview({ monitoring_mode: 'writeup_or_trend' }, post, ['https://example.com/photo.jpg']), true);
  assert.equal(intakePriority({ monitoring_mode: 'writeup_or_trend' }, post, { prioritizeBasketball: true }), -1);
  const extracted = monitoredTextExtraction({ publish_mode: 'writeup_review', reuse_permission: 'PENDING_SOURCE_TERMS' },
    `${post.text}\n- Jaylen Brown o9.5 RA (-122) https://t.co/example`);
  assert.equal(extracted.plays.length, 2);
  assert.deepEqual(extracted.plays.map(play => play.odds_american), ['-110', '-120']);
  assert.equal(extracted.plays[0].player_name, "D'Andre Swift");
  assert.equal(monitoredTextExtraction({ publish_mode: 'writeup_review', reuse_permission: 'CONFIRMED' }, post.text), null);
});

test('verifies each unnamed-event leg independently instead of assigning the parent sport', async () => {
  const packet = { analysis: { extraction: { plays: [
    { selection: "D'Andre Swift o14.5 Rush Attempts (-110)", player_name: "D'Andre Swift", event: '' },
    { selection: 'Aaron Gordon o5.5 Rebounds (-120)', player_name: 'Aaron Gordon', event: '' }
  ] } } };
  const seen = [];
  const result = await candidateEventTiming(packet, {
    verifySingle: async single => {
      seen.push(single.analysis.extraction.plays[0].selection);
      return { status: 'UPCOMING', eventStart: '2026-10-23T00:15:00.000Z', verifiedEvent: 'Verified matchup' };
    },
    verifyAll: async () => { throw new Error('Mixed card should not use one league check'); }
  });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(result.playStatuses.length, 2);
  assert.deepEqual(seen, packet.analysis.extraction.plays.map(play => play.selection));
});

test('prioritizes strong text picks before signaled and image-only media', () => {
  assert.equal(mediaCaptionHasBetSignal('Tonight\'s betting card'), true);
  assert.equal(mediaCaptionHasBetSignal('Practice photos'), false);
  assert.equal(intakePriority({ monitoring_mode: 'standard' }, { text: 'NFL Rams -4.5 2u' }), 1);
  assert.equal(intakePriority({ monitoring_mode: 'standard' }, { text: 'MLB player over 1.5 hits' }), 3);
  assert.equal(intakePriority({ monitoring_mode: 'writeup_or_trend' }, { text: 'NFL card', attachments: { media_keys: ['1'] } }), 4);
  assert.equal(intakePriority({ monitoring_mode: 'photo_review' }, { text: '', attachments: { media_keys: ['1'] } }), 6);
});

test('gives NBA text picks first look on an NBA slate without changing eligibility', () => {
  const nba = { text: 'NBA Jayson Tatum over 5.5 assists (-140)' };
  const nbaAbbrev = { text: 'KAT over 4.5 ast -139' };
  const nfl = { text: 'NFL Rams -4.5 2u' };
  assert.equal(basketballPriority(nba), 0);
  assert.equal(basketballPriority(nbaAbbrev), 0);
  assert.equal(basketballPriority({ text: 'NFL Chiefs over 21.5 points' }), 1);
  assert.ok(intakePriority({}, nba, { prioritizeBasketball: true }) < intakePriority({}, nfl, { prioritizeBasketball: true }));
  assert.ok(intakePriority({}, nbaAbbrev, { prioritizeBasketball: true }) < intakePriority({}, nfl, { prioritizeBasketball: true }));
  assert.equal(intakePriority({}, nba), 3);
});

test('NBA schedule preflight is fail-open and detects a same-day slate', async () => {
  assert.equal(await nbaGamesScheduledToday({ now: new Date('2026-10-20T18:00:00Z'),
    fetchImpl: async () => ({ ok: true, json: async () => ({ events: [{ name: 'Celtics at Pistons' }] }) }) }), true);
  assert.equal(await nbaGamesScheduledToday({ now: new Date('2026-10-20T18:00:00Z'),
    fetchImpl: async () => ({ ok: true, json: async () => ({ events: [] }) }) }), false);
  assert.equal(await nbaGamesScheduledToday({ fetchImpl: async () => ({ ok: false }) }), null);
});

test('prioritizes source-supported writeups within the same sport', () => {
  const supported = {
    text: [
      'NFL Jaxson Dart over 204.5 passing yards -115',
      '230 yards in last season matchup',
      'Opposing QBs cleared in 14 of 17 games',
      'Averaged 222 yards in 8 road starts'
    ].join('\n')
  };
  assert.equal(sourceSupportSignalCount(supported.text), 4);
  assert.equal(intakePriority({ monitoring_mode: 'standard' }, supported), 0);
  assert.equal(intakePriority({ monitoring_mode: 'standard' }, { text: 'NFL Jaxson Dart over 204.5 passing yards -115' }), 1);
});

test('rotates the source roster so capped runs do not repeatedly favor the same accounts', () => {
  const sources = ['a', 'b', 'c', 'd'];
  assert.deepEqual(rotateSources(sources, 0), sources);
  assert.deepEqual(rotateSources(sources, 2), ['c', 'd', 'a', 'b']);
  assert.deepEqual(rotateSources(sources, 6), ['c', 'd', 'a', 'b']);
  assert.deepEqual(rotateSources(sources, -1), ['d', 'a', 'b', 'c']);
});

test('defaults to one paid extraction per source per run', () => {
  assert.equal(configuredPerSourceModelCallLimit({}), 1);
  assert.equal(configuredPerSourceModelCallLimit({ X_MONITOR_MAX_MODEL_CALLS_PER_SOURCE_PER_RUN: '2' }), 2);
  assert.equal(configuredPerSourceModelCallLimit({ X_MONITOR_MAX_MODEL_CALLS_PER_SOURCE_PER_RUN: '0' }), 1);
});

test('one source cannot consume the run-wide model budget', () => {
  const runBudget = createModelCallBudget(3);
  const sourceA = createSourceModelCallReservation(runBudget, 1);
  const sourceB = createSourceModelCallReservation(runBudget, 1);
  const sourceC = createSourceModelCallReservation(runBudget, 1);
  assert.equal(sourceA.tryStart(), true);
  assert.equal(sourceA.tryStart(), false);
  assert.equal(sourceB.tryStart(), true);
  assert.equal(sourceC.tryStart(), true);
  assert.equal(runBudget.started, 3);
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
  assert.equal(nextState.image_rescan_version, 'source-routing-image-rescan-v4');
  assert.equal(nextState.upcoming_slate_rescan_version, 'upcoming-slate-rescan-v1');
});

test('exclusive recovery rescan remains eligible after a budget-limited partial pass', () => {
  const options = {
    sourceState: { since_id: '100', upcoming_slate_rescan_version: 'upcoming-slate-rescan-v1' },
    userId: 'exclusive-source', date: '2026-09-17', lastProcessedId: '300',
    handledPostIds: new Set(['150']), rescanImages: false, rescanUpcomingSlate: true,
    upcomingSlateRescanVersion: 'upcoming-slate-rescan-v1-exclusive-team-v2'
  };
  const partial = sourceStateAfterPass({ ...options, completedSourcePass: false });
  assert.equal(partial.upcoming_slate_rescan_version, undefined);
  assert.equal(partial.since_id, '100');
  const complete = sourceStateAfterPass({ ...options, completedSourcePass: true });
  assert.equal(complete.upcoming_slate_rescan_version, options.upcomingSlateRescanVersion);
});

test('today-only per-source catch-up allowance reverts without a restart',()=>{
 const env={X_MONITOR_RECOVERY_DATE:'2026-10-13',X_MONITOR_RECOVERY_PER_SOURCE_MODEL_CALLS:'4'};
 assert.equal(configuredPerSourceModelCallLimit(env,new Date('2026-10-14T06:59:59Z')),4);
 assert.equal(configuredPerSourceModelCallLimit(env,new Date('2026-10-14T07:00:00Z')),1);
});
