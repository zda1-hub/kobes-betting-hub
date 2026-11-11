const test = require('node:test');
const assert = require('node:assert/strict');
const { hydrateCanonicalPlayer } = require('./canonical-pick-player');
const row = { pick_id: '20261110-073-03-X', operating_date: '2026-11-10', selection: '25+ points', published_line: '25+ points', published_odds_american: '-120', sport: 'Basketball', event: 'Milwaukee Bucks @ New York Knicks', result: 'PENDING' };
const packet = { pick_id: row.pick_id, operating_date: row.operating_date, analysis: { extraction: { selection: row.selection, line: row.published_line, odds_american: '-120', player_name: 'Jalen Brunson', event: row.event, sport: row.sport } } };
test('hydrates exact unnamed milestone only from matching explicit approved identity', () => {
  const next = hydrateCanonicalPlayer(row, packet);
  assert.equal(next.selection, 'Jalen Brunson 25+ points');
  assert.deepEqual(next, { ...row, selection: 'Jalen Brunson 25+ points' });
  assert.equal(row.selection, '25+ points');
  assert.equal(hydrateCanonicalPlayer(next, packet), next);
});
test('does not recover name from claims, another pick, different line/odds/date, or a group', () => {
  for (const patch of [{ player_name: '' }, { line: '24+ points' }, { odds_american: '-110' }, { playerName: 'Other Player' }, { plays: [{ selection: '25+ points' }, { selection: 'Other Player over 1.5 assists' }] }]) {
    const changed = structuredClone(packet); Object.assign(changed.analysis.extraction, patch);
    changed.analysis.extraction.source_claims = ['Jalen Brunson has scored 30'];
    assert.equal(hydrateCanonicalPlayer(row, changed), row);
  }
  assert.equal(hydrateCanonicalPlayer(row, { ...packet, pick_id: '20261110-099-X' }), row);
  assert.equal(hydrateCanonicalPlayer(row, { ...packet, operating_date: '2026-11-09' }), row);
});
test('unknown market and already named selection remain immutable', () => {
  for (const selection of ['25+ special', '25+', 'Other Player 25+ points']) {
    const changedRow = { ...row, selection };
    const changedPacket = structuredClone(packet); changedPacket.analysis.extraction.selection = selection;
    assert.equal(hydrateCanonicalPlayer(changedRow, changedPacket), changedRow);
  }
});
