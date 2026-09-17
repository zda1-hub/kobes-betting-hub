const test = require('node:test');
const assert = require('node:assert/strict');
const { espnLeague, isRecentSourcePost, matchesExtractedEvent, upcomingEventStatus, upcomingEventStatuses } = require('./event-timing');

const packet = {
  source: { posted_at: '2026-08-30T14:00:00.000Z' },
  analysis: { extraction: { league: 'MLB', sport: 'Baseball', event: 'Texas Rangers vs Chicago White Sox' } }
};

const scoreboard = {
  events: [{
    date: '2026-08-30T21:10:00.000Z',
    competitions: [{ competitors: [
      { team: { displayName: 'Texas Rangers', shortDisplayName: 'Rangers', abbreviation: 'TEX' } },
      { team: { displayName: 'Chicago White Sox', shortDisplayName: 'White Sox', abbreviation: 'CWS' } }
    ] }]
  }]
};

test('classifies image-extracted sport-specific markets when the league label is missing', () => {
  assert.equal(espnLeague({ analysis: { extraction: { selection: 'Corbin Carroll to hit a home run +470' } } }), 'baseball/mlb');
  assert.equal(espnLeague({ analysis: { extraction: { selection: 'DeMario Douglas over 3.5 receptions' } } }), 'football/nfl');
  assert.equal(espnLeague({ analysis: { extraction: { selection: 'LeBron James over 22.5 points', market: 'player points' } } }), 'basketball/nba');
});

test('keeps a matching ESPN event only while it is upcoming', async () => {
  const result = await upcomingEventStatus(packet, {
    now: new Date('2026-08-30T18:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify(scoreboard), { status: 200 })
  });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(result.eventStart, '2026-08-30T21:10:00.000Z');
});

test('allows a verified NFL pick scheduled within the upcoming weekend slate', async () => {
  const sundayPacket = {
    analysis: { extraction: { league: 'NFL', sport: 'Football', event: 'Philadelphia Eagles at Dallas Cowboys' } }
  };
  const result = await upcomingEventStatus(sundayPacket, {
    now: new Date('2026-09-11T18:00:00.000Z'),
    fetchImpl: async (url) => new Response(JSON.stringify({ events: url.includes('dates=20260913') ? [{
      date: '2026-09-13T20:25:00.000Z', competitions: [{ competitors: [
        { team: { displayName: 'Philadelphia Eagles', shortDisplayName: 'Eagles', abbreviation: 'PHI' } },
        { team: { displayName: 'Dallas Cowboys', shortDisplayName: 'Cowboys', abbreviation: 'DAL' } }
      ] }]
    }] : [] }), { status: 200 })
  });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(result.eventStart, '2026-09-13T20:25:00.000Z');
});

test('uses one scoreboard lookup for a current-day match and concurrent roster lookups', async () => {
  const calls = [];
  let releaseRosters;
  const rostersReady = new Promise((resolve) => { releaseRosters = resolve; });
  const concurrencyPacket = {
    pick_id: 'concurrency-test',
    analysis: { extraction: {
      league: 'NFL', sport: 'Football', event: 'New York Giants vs Dallas Cowboys',
      player_name: 'Jaxson Dart', selection: 'Jaxson Dart over 204.5 passing yards'
    } }
  };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/scoreboard?')) {
      return new Response(JSON.stringify({ events: [{
        date: '2026-09-13T17:00:00.000Z', competitions: [{ competitors: [
          { team: { id: '19', displayName: 'New York Giants', shortDisplayName: 'Giants', abbreviation: 'NYG' } },
          { team: { id: '6', displayName: 'Dallas Cowboys', shortDisplayName: 'Cowboys', abbreviation: 'DAL' } }
        ] }]
      }] }), { status: 200 });
    }
    if (calls.filter((value) => value.includes('/roster')).length === 2) releaseRosters();
    await rostersReady;
    return new Response(JSON.stringify({ athletes: [{ items: [{ displayName: url.includes('/19/') ? 'Jaxson Dart' : 'Dak Prescott' }] }] }), { status: 200 });
  };

  const result = await upcomingEventStatus(concurrencyPacket, {
    now: new Date('2026-09-13T12:00:00.000Z'), fetchImpl
  });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(calls.filter((url) => url.includes('/scoreboard?')).length, 1);
  assert.equal(calls.filter((url) => url.includes('/roster')).length, 2);
});

test('bounds an event verification that never returns', async () => {
  const result = await upcomingEventStatus(packet, {
    now: new Date('2026-08-30T18:00:00.000Z'),
    timeoutMs: 5,
    fetchImpl: async () => new Promise(() => {})
  });
  assert.equal(result.status, 'UNVERIFIABLE');
  assert.match(result.reason, /3 seconds/);
});

test('blocks a matching event after its scheduled start', async () => {
  const result = await upcomingEventStatus(packet, {
    now: new Date('2026-08-30T22:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify(scoreboard), { status: 200 })
  });
  assert.equal(result.status, 'STARTED_OR_FINISHED');
});

test('blocks a player prop when the player is not on either event team', async () => {
  const nflPacket = {
    analysis: { extraction: {
      league: 'NFL', sport: 'Football', event: 'New England Patriots vs Seattle Seahawks',
      player_name: 'A.J. Brown', selection: 'A.J. Brown Longest Reception Over 22.5 Yards'
    } }
  };
  const nflScoreboard = {
    events: [{
      date: '2026-09-10T00:30:00.000Z',
      competitions: [{ competitors: [
        { team: { id: '17', displayName: 'New England Patriots', shortDisplayName: 'Patriots', abbreviation: 'NE' } },
        { team: { id: '25', displayName: 'Seattle Seahawks', shortDisplayName: 'Seahawks', abbreviation: 'SEA' } }
      ] }]
    }]
  };
  const fetchImpl = async (url) => {
    if (url.includes('/scoreboard?')) return new Response(JSON.stringify(nflScoreboard), { status: 200 });
    return new Response(JSON.stringify({ athletes: [{ position: 'offense', items: [{ displayName: url.includes('/17/') ? 'Drake Maye' : 'Sam Darnold' }] }] }), { status: 200 });
  };
  const result = await upcomingEventStatus(nflPacket, {
    now: new Date('2026-09-09T22:00:00.000Z'), fetchImpl
  });
  assert.equal(result.status, 'PLAYER_NOT_ON_EVENT_TEAM');
  assert.match(result.reason, /A\.J\. Brown/);
});

test('allows a player prop when the player is listed on an event team', async () => {
  const nflPacket = {
    analysis: { extraction: {
      league: 'NFL', sport: 'Football', event: 'New England Patriots vs Seattle Seahawks',
      player_name: 'DeMario Douglas', selection: 'DeMario Douglas Over 3.5 Receptions'
    } }
  };
  const nflScoreboard = {
    events: [{
      date: '2026-09-10T00:30:00.000Z',
      competitions: [{ competitors: [
        { team: { id: '17', displayName: 'New England Patriots', shortDisplayName: 'Patriots', abbreviation: 'NE' } },
        { team: { id: '25', displayName: 'Seattle Seahawks', shortDisplayName: 'Seahawks', abbreviation: 'SEA' } }
      ] }]
    }]
  };
  const fetchImpl = async (url) => {
    if (url.includes('/scoreboard?')) return new Response(JSON.stringify(nflScoreboard), { status: 200 });
    return new Response(JSON.stringify({ athletes: [{ position: 'offense', items: [{ displayName: url.includes('/17/') ? 'DeMario Douglas' : 'Sam Darnold' }] }] }), { status: 200 });
  };
  const result = await upcomingEventStatus(nflPacket, {
    now: new Date('2026-09-09T22:00:00.000Z'), fetchImpl
  });
  assert.equal(result.status, 'UPCOMING');
});

test('rejects a college-football pick that has no game scheduled today', async () => {
  const result = await upcomingEventStatus({
    analysis: { extraction: { league: 'NCAAF', sport: 'College Football', event: 'Texas Longhorns vs Ohio State Buckeyes' } }
  }, {
    now: new Date('2026-09-06T16:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify({ events: [] }), { status: 200 })
  });
  assert.equal(result.status, 'NOT_SCHEDULED_TODAY');
});

test('validates each leg of a multi-game college-football parlay', async () => {
  const cfbPacket = {
    analysis: { extraction: {
      league: 'NCAAF', sport: 'College Football', event: 'Week 2 CFB Lotto',
      plays: [
        { selection: 'Indiana team total over 50 points', line: '50+', odds_american: '-371', units: '', event: 'Howard @ Indiana' },
        { selection: 'Georgia team total over 50 points', line: '50+', odds_american: '+127', units: '', event: 'Western Kentucky @ Georgia' }
      ]
    } }
  };
  const result = await upcomingEventStatus(cfbPacket, {
    now: new Date('2026-09-12T14:00:00.000Z'),
    fetchImpl: async (url) => {
      assert.match(url, /football\/college-football\/scoreboard/);
      return new Response(JSON.stringify({ events: [
        { date: '2026-09-12T16:00:00.000Z', competitions: [{ competitors: [
          { team: { displayName: 'Howard Bison', shortDisplayName: 'Howard', abbreviation: 'HOW' } },
          { team: { displayName: 'Indiana Hoosiers', shortDisplayName: 'Indiana', abbreviation: 'IND' } }
        ] }] },
        { date: '2026-09-12T16:45:00.000Z', competitions: [{ competitors: [
          { team: { displayName: 'Western Kentucky Hilltoppers', shortDisplayName: 'Western Kentucky', abbreviation: 'WKU' } },
          { team: { displayName: 'Georgia Bulldogs', shortDisplayName: 'Georgia', abbreviation: 'UGA' } }
        ] }] }
      ] }), { status: 200 });
    }
  });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(result.eventStart, '2026-09-12T16:00:00.000Z');
});

test('reports valid upcoming legs separately when another parlay leg is not scheduled', async () => {
  const cfbPacket = {
    analysis: { extraction: {
      league: 'NCAAF', sport: 'College Football', event: 'Saturday CFB Parlay',
      plays: [
        { selection: 'Michigan State alternate spread', line: '-13.5', odds_american: '-178', units: '', event: 'Eastern Michigan @ Michigan State' },
        { selection: 'Unavailable team total over 50 points', line: '50', odds_american: '-110', units: '', event: 'Unavailable State @ Nowhere University' }
      ]
    } }
  };
  const result = await upcomingEventStatuses(cfbPacket, {
    now: new Date('2026-09-12T14:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify({ events: [
      { date: '2026-09-12T19:30:00.000Z', competitions: [{ competitors: [
        { team: { displayName: 'Eastern Michigan Eagles', shortDisplayName: 'Eastern Michigan', abbreviation: 'EMU' } },
        { team: { displayName: 'Michigan State Spartans', shortDisplayName: 'Michigan State', abbreviation: 'MSU' } }
      ] }] }
    ] }), { status: 200 })
  });
  assert.equal(result.status, 'NOT_SCHEDULED_TODAY');
  assert.equal(result.playStatuses[0].status, 'UPCOMING');
  assert.equal(result.playStatuses[1].status, 'NOT_SCHEDULED_TODAY');
  assert.equal(result.playStatuses[0].play.selection, 'Michigan State alternate spread');
});

test('does not allow an undated or unsupported pick through the schedule gate', async () => {
  const result = await upcomingEventStatus({
    analysis: { extraction: { league: 'Unknown league', event: '' } }
  });
  assert.equal(result.status, 'UNVERIFIABLE');
});

test('does not treat old source posts as fresh when the matchup is unavailable', () => {
  assert.equal(isRecentSourcePost(packet, { now: new Date('2026-08-31T15:00:00.000Z'), maximumAgeHours: 24 }), false);
});

const exclusiveSide = {
  source: { publish_mode: 'terms_only' },
  analysis: { extraction: { league: 'NFL', sport: 'NFL', event: '', player_name: '',
    plays: [{ selection: 'Lions +5.5', line: '+5.5', odds_american: '-114', event: '', player_name: '' }] } }
};
const exclusiveGame = { id: 'det-buf', name: 'Detroit Lions at Buffalo Bills', date: '2026-09-17T23:15:00Z',
  competitions: [{ competitors: [
    { team: { displayName: 'Detroit Lions', shortDisplayName: 'Lions', name: 'Lions', abbreviation: 'DET' } },
    { team: { displayName: 'Buffalo Bills', shortDisplayName: 'Bills', name: 'Bills', abbreviation: 'BUF' } }
  ] }] };
test('two aliases for one team cannot verify an explicit different opponent', () => {
  assert.equal(matchesExtractedEvent({ analysis: { extraction: { event: 'Detroit Lions at Kansas City Chiefs' } } }, exclusiveGame), false);
  assert.equal(matchesExtractedEvent({ analysis: { extraction: { event: 'Detroit Lions at Buffalo Bills' } } }, exclusiveGame), true);
});
function exclusiveFetch(events, failedDay = '') {
  return async url => new Response(JSON.stringify({ events }), { status: failedDay && url.includes(failedDay) ? 503 : 200 });
}

test('resolves an exclusive team-side post to one official matchup without changing source terms', async () => {
  const input = structuredClone(exclusiveSide);
  const snapshot = structuredClone(input);
  const result = await upcomingEventStatuses(input, { now: new Date('2026-09-17T20:00:00Z'), fetchImpl: exclusiveFetch([exclusiveGame]) });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(result.playStatuses[0].verifiedEvent, 'Detroit Lions at Buffalo Bills');
  assert.deepEqual(input, snapshot);
  assert.equal(result.playStatuses[0].play.odds_american, '-114');
});

test('refuses ambiguous exclusive team fixtures and incomplete schedule coverage', async () => {
  const options = { now: new Date('2026-09-17T20:00:00Z') };
  const another = { ...exclusiveGame, id: 'second-det', date: '2026-09-19T23:15:00Z' };
  for (const fetchImpl of [exclusiveFetch([exclusiveGame, another]), exclusiveFetch([exclusiveGame], '20260919')]) {
    const result = await upcomingEventStatuses(exclusiveSide, { ...options, fetchImpl });
    assert.notEqual(result.status, 'UPCOMING');
  }
});

test('exclusive matchup resolution does not guess player props, change explicit matchups, or permit started games', async () => {
  const options = { now: new Date('2026-09-17T20:00:00Z'), fetchImpl: exclusiveFetch([exclusiveGame]) };
  for (const changes of [
    { selection: 'Jameson Williams 60+ receiving yards', player_name: 'Jameson Williams' },
    { event: 'Detroit Lions at Kansas City Chiefs' },
    { selection: 'over 49.5 points' },
    { selection: 'Lionsgate +5.5' }
  ]) {
    const input = structuredClone(exclusiveSide);
    Object.assign(input.analysis.extraction.plays[0], changes);
    const result = await upcomingEventStatuses(input, options);
    assert.notEqual(result.status, 'UPCOMING');
  }
  const started = await upcomingEventStatuses(exclusiveSide, { ...options, now: new Date('2026-09-18T00:00:00Z') });
  assert.equal(started.status, 'STARTED_OR_FINISHED');
  const regular = structuredClone(exclusiveSide);
  regular.source.publish_mode = 'writeup_review';
  assert.equal((await upcomingEventStatuses(regular, options)).status, 'UNVERIFIABLE');
});
