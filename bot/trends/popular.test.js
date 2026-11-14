const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPopularCard } = require('./popular');

const now = Date.parse('2026-11-14T20:00:00Z');
const legs = ['a', 'b', 'c'].map(id => ({
  id, player: `${id} Player`, market: 'receptions', line: 3.5, odds: -180,
  sportsbook: 'Example Book', sportsbookKey: 'examplebook', available: true, updatedAt: new Date(now - 60_000).toISOString(),
  gameId: 'game1', startsAt: new Date(now + 3_600_000).toISOString(),
  recentHits: 2, recentSample: 2, seasonHits: 20, seasonSample: 25,
  analysisSource: 'licensed-feed', analysisCheckedAt: new Date(now - 60_000).toISOString(),
  availabilityVerified: true, availabilityCheckedAt: new Date(now - 60_000).toISOString()
}));
const searchEvidence = { source: 'kbh-prop-search', serviceDate: '2026-11-14', uniqueSearchers: 5, legIds: ['a', 'b', 'c'] };

test('popular card requires measured searches for the exact legs and avoids parlay odds claims', () => {
  const card = buildPopularCard({ legs, searchEvidence, serviceDate: '2026-11-14', now });
  assert.match(card.title, /among KBH searches/);
  assert.match(card.lines[0], /2\/2 recent; 20\/25 season/);
  assert.equal(card.combinedProbability, null);
  assert.equal(card.combinedPayout, null);
  assert.throws(() => buildPopularCard({ legs, searchEvidence: { ...searchEvidence, legIds: ['x', 'y', 'z'] }, serviceDate: '2026-11-14', now }));
  assert.throws(() => buildPopularCard({ legs, searchEvidence: { ...searchEvidence, uniqueSearchers: 0 }, serviceDate: '2026-11-14', now }));
});

test('a stale price, started game, missing availability or unverifiable history blocks the card', () => {
  for (const change of [
    { odds: -401 }, { updatedAt: new Date(now - 6 * 60_000).toISOString() },
    { startsAt: new Date(now - 1).toISOString() }, { availabilityVerified: false },
    { seasonSample: 2 }, { recentHits: 3 }, { analysisSource: null }, { sportsbookKey: 'anotherbook' }
  ]) {
    assert.throws(() => buildPopularCard({ legs: [{ ...legs[0], ...change }, ...legs.slice(1)], searchEvidence, serviceDate: '2026-11-14', now }));
  }
});
