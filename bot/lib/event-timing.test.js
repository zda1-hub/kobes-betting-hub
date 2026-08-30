const test = require('node:test');
const assert = require('node:assert/strict');
const { isRecentSourcePost, upcomingEventStatus } = require('./event-timing');

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

test('keeps a matching ESPN event only while it is upcoming', async () => {
  const result = await upcomingEventStatus(packet, {
    now: new Date('2026-08-30T18:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify(scoreboard), { status: 200 })
  });
  assert.equal(result.status, 'UPCOMING');
  assert.equal(result.eventStart, '2026-08-30T21:10:00.000Z');
});

test('blocks a matching event after its scheduled start', async () => {
  const result = await upcomingEventStatus(packet, {
    now: new Date('2026-08-30T22:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify(scoreboard), { status: 200 })
  });
  assert.equal(result.status, 'STARTED_OR_FINISHED');
});

test('does not treat old source posts as fresh when the matchup is unavailable', () => {
  assert.equal(isRecentSourcePost(packet, { now: new Date('2026-08-31T15:00:00.000Z'), maximumAgeHours: 24 }), false);
});
