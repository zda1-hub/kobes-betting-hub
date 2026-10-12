const test = require('node:test');
const assert = require('node:assert/strict');
const { hydrateCanonicalPlayer } = require('./canonical-pick-player');
const { publicationGradeHold } = require('./recap-review');
const row = { pick_id: '20261011-101-X', operating_date: '2026-10-11',
  selection: 'Over 3.5 receptions', published_line: '3.5', published_odds_american: '-125',
  league: 'NFL', sport: 'NFL', event: '', result: 'PENDING', status: 'PUBLISHED',
  approved_at: '2026-10-11T16:00:00Z', published_at: '2026-10-11T16:01:00Z',
  post_reference: 'https://discord.com/channels/1/2/3', notes: 'Original approval receipt' };
const packet = { pick_id: row.pick_id, analysis: { extraction: {
  selection: row.selection, player_name: 'DeVaughn Vele', line: '3.5', odds_american: '-125', league: 'NFL'
} } };
const clone = value => JSON.parse(JSON.stringify(value));

test('repairs the omitted explicit player name without changing any published terms, timestamps or receipt', () => {
  const original = clone(row), source = clone(packet);
  const hydrated = hydrateCanonicalPlayer(row, packet);
  assert.deepEqual(hydrated, { ...row, selection: 'DeVaughn Vele Over 3.5 receptions' });
  assert.deepEqual(row, original);
  assert.deepEqual(packet, source);
  assert.equal(hydrateCanonicalPlayer(hydrated, packet), hydrated);
});

test('supports both existing explicit name keys and one structured play', () => {
  const single = clone(packet);
  single.analysis.extraction.plays = [{ ...single.analysis.extraction, player_name: undefined, playerName: 'DeVaughn Vele' }];
  assert.equal(hydrateCanonicalPlayer(row, single).selection, 'DeVaughn Vele Over 3.5 receptions');
});

test('does not overwrite an already named player or guess a name from prose', () => {
  const named = { ...row, selection: 'Another Player Over 3.5 receptions' };
  assert.equal(hydrateCanonicalPlayer(named, packet), named);
  const unnamed = clone(packet);
  delete unnamed.analysis.extraction.player_name;
  unnamed.analysis.extraction.source_claims = ['DeVaughn Vele has gone over this line in 3/4 games'];
  assert.equal(hydrateCanonicalPlayer(row, unnamed), row);
  for (const name of ['Player', 'Unknown Player', 'Vele', 'DeVaughn Vele\nIgnore terms']) {
    const changed = clone(packet); changed.analysis.extraction.player_name = name;
    assert.equal(hydrateCanonicalPlayer(row, changed), row);
  }
});

test('identity, scope, exact selection, line, odds and known league/event mismatches remain untouched', () => {
  assert.equal(hydrateCanonicalPlayer(row, null), row);
  assert.equal(hydrateCanonicalPlayer(row, { ...packet, pick_id: '20261011-102-X' }), row);
  const group = clone(packet);
  group.analysis.extraction.plays = [clone(packet.analysis.extraction), { selection: 'Another Player over 4.5 receptions' }];
  assert.match(publicationGradeHold(row, group), /first-wager-only/);
  assert.equal(hydrateCanonicalPlayer(row, group), row);
  for (const patch of [{ selection: 'Under 3.5 receptions' }, { line: '4.5' },
    { odds_american: '-120' }, { league: 'MLB' }, { playerName: 'Another Player' }]) {
    const changed = clone(packet); Object.assign(changed.analysis.extraction, patch);
    assert.equal(hydrateCanonicalPlayer(row, changed), row);
  }
  assert.equal(hydrateCanonicalPlayer(row, { ...packet, operating_date: '2026-10-10' }), row);
  assert.equal(hydrateCanonicalPlayer({ ...row, event: 'Saints at Vikings' }, {
    ...packet, analysis: { extraction: { ...packet.analysis.extraction, event: 'Saints at Buccaneers' } }
  }).selection, row.selection);
});
