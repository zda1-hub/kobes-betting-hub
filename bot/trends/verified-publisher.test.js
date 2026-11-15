'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { assertEvidence, candidateId, publishVerifiedCandidate } = require('./verified-publisher');

test('paid trend publication rejects research with unconfirmed upstream rights', () => {
  assert.throws(() => assertEvidence({
    player: 'Example Player',
    rights: { history: 'unverified', availability: 'unverified' }
  }, Date.parse('2026-11-15T19:00:00Z')), /Commercial source rights/);
});

test('Jokić/Jokic share a receipt; verified NBA research sends once with uncertainty stated', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trends-pub-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = new Date('2026-11-15T19:00:00Z');
  const count = (hits, sample) => ({ hits, sample, hitRate: hits / sample, pushes: 0 });
  const candidate = { player: 'Nikola Jokić', rights: { history: 'commercial-use-confirmed',
    availability: 'commercial-use-confirmed' },
  analysis: { season: count(9, 10), l5: count(5, 5), l10: count(9, 10), l20: count(17, 20) },
  analysisSource: 'https://api.balldontlie.io/v1/stats', analysisCheckedAt: now.toISOString(),
  availability: { status: 'active-roster-no-listed-injury', checkedAt: now.toISOString(),
    sourceUrl: 'https://api.balldontlie.io/v1/player_injuries',
    rightsUrl: 'https://www.balldontlie.io/terms.html' },
  prop: { sport: 'NBA', stat: 'points', side: 'over', line: 20.5, odds: -110,
    eventId: 'event-12345678', teamId: 'Denver Nuggets', opponentId: 'New Orleans Pelicans',
    startsAt: '2026-11-15T20:00:00Z', updatedAt: now.toISOString(), sportsbook: 'DraftKings',
    source: 'The Odds API', available: true, rosterVerified: true, rosterVerifiedAt: now.toISOString(),
    participationVerified: false, preGameAvailabilityChecked: true } };
  assert.equal(candidateId(candidate), candidateId({ ...candidate, player: 'Nikola Jokic' }));
  let sent = 0, content;
  const channelFor = async () => ({ id: '1571285528882450623', isTextBased: () => true,
    send: async payload => { sent++; content = payload.content; return { id: '123456789012345678' }; } });
  const first = await publishVerifiedCandidate({ root, candidate, channelId: '1571285528882450623', channelFor, now });
  const second = await publishVerifiedCandidate({ root, candidate: { ...candidate, player: 'Nikola Jokic' },
    channelId: '1571285528882450623', channelFor, now });
  assert.equal(first.status, 'published');
  assert.equal(second.existing, true);
  assert.equal(sent, 1);
  assert.match(content, /game participation is not confirmed/);
});

test('NFL publication accepts fresh game-week nflverse evidence and rejects stale or mismatched releases', () => {
  const now = new Date('2026-11-15T17:00:00Z');
  const count = (hits, sample) => ({ hits, sample, hitRate: hits / sample, pushes: 0 });
  const candidate = { player: 'Sample Receiver', rights: { history: 'commercial-use-confirmed',
    availability: 'commercial-use-confirmed' },
  analysis: { season: count(8, 8), l5: count(5, 5), l10: count(10, 10), l20: count(20, 20) },
  analysisSource: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv',
  analysisCheckedAt: now.toISOString(),
  availability: { status: 'active-roster-no-listed-injury', checkedAt: now.toISOString(),
    sourceUrl: 'https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv',
    rosterSourceUrl: 'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv',
    sourceUpdatedAt: '2026-11-15T12:00:00Z', rosterUpdatedAt: '2026-11-15T12:00:00Z',
    rightsUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md',
    gameWeek: 10, rosterWeek: 10, injuryFeedWeek: 10 },
  prop: { sport: 'NFL', stat: 'receptions', side: 'over', line: 3.5, odds: -150,
    eventId: 'event-12345678', teamId: 'Green Bay Packers', opponentId: 'New York Giants',
    startsAt: '2026-11-15T18:00:00Z', updatedAt: now.toISOString(), sportsbook: 'DraftKings',
    source: 'The Odds API', available: true, rosterVerified: true, rosterVerifiedAt: now.toISOString(),
    participationVerified: false, preGameAvailabilityChecked: true } };
  assert.equal(assertEvidence(candidate, now.valueOf()).qualifies, true);
  assert.throws(() => assertEvidence({ ...candidate,
    availability: { ...candidate.availability, injuryFeedWeek: 9 } }, now.valueOf()), /Verified market/);
  assert.throws(() => assertEvidence({ ...candidate,
    availability: { ...candidate.availability, sourceUpdatedAt: '2026-11-13T00:00:00Z' } }, now.valueOf()), /Verified market/);
});
