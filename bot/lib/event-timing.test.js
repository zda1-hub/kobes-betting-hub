const test = require('node:test');
const assert = require('node:assert/strict');
const { espnLeague, isRecentSourcePost, upcomingEventStatus, upcomingEventStatuses } = require('./event-timing');

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
