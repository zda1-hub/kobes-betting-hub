const test = require('node:test');
const assert = require('node:assert/strict');
const { activeWindow, alertDescription, findArbitrage } = require('./arbitrage-paper-monitor');

const event = { id: 'game-1', sport_title: 'NBA', away_team: 'Away', home_team: 'Home', commence_time: '2026-09-24T01:00:00Z', bookmakers: [
  { key: 'fanduel', title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.2 }, { name: 'Home', price: 1.7 }] }] },
  { key: 'draftkings', title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [{ name: 'Away', price: 2.0 }, { name: 'Home', price: 2.2 }] }] }
] };

test('finds a two-book arbitrage and produces a balanced $1,000 example', () => {
  const [opportunity] = findArbitrage([event], { minimumEdgePercent: 2, bankroll: 1000 });
  assert.ok(opportunity.edgePercent > 9);
  assert.equal(Math.round(opportunity.legs.reduce((sum, leg) => sum + leg.stake, 0)), 1000);
  assert.equal(opportunity.legs[0].book, 'fanduel');
  assert.equal(opportunity.legs[1].book, 'draftkings');
  assert.match(alertDescription(opportunity), /Total example: \*\*\$1000\.00\*\*/);
});

test('rejects non-arbitrage, same-book, draw markets and sub-threshold edges', () => {
  assert.equal(findArbitrage([{ ...event, bookmakers: [event.bookmakers[0]] }]).length, 0);
  const draw = structuredClone(event); draw.bookmakers[0].markets[0].outcomes.push({ name: 'Draw', price: 3 });
  assert.equal(findArbitrage([draw]).length, 0);
  assert.equal(findArbitrage([event], { minimumEdgePercent: 20 }).length, 0);
});

test('uses short Arizona monitoring windows', () => {
  assert.equal(activeWindow(new Date('2026-09-23T16:35:00Z'), ['09:30'], 25), '09:30');
  assert.equal(activeWindow(new Date('2026-09-23T16:56:00Z'), ['09:30'], 25), null);
});
