'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getNbaBuilder, addNbaBuilderLeg, removeNbaBuilderLeg,
  clearNbaBuilder, reviewNbaBuilder, formatNbaBuilder, SESSION_MS } = require('./nba-builder');

const now = new Date('2026-11-15T02:00:00.000Z');
const userId = '123456789012345678';
const base = { userId, now, oddsKey: 'test-odds', bdlKey: 'test-bdl' };

function fixture(query, overrides = {}) {
  return { player: query.player, team: 'Dallas Mavericks', opponent: 'Denver Nuggets',
    eventId: 'game-1', startsAt: '2026-11-15T03:00:00.000Z',
    stat: query.stat, side: query.side, line: query.line,
    marketCheckedAt: now.toISOString(),
    availability: { status: 'active-roster-no-listed-injury', checkedAt: now.toISOString() },
    offers: [{ sportsbook: 'Example Book', sportsbookKey: 'example', odds: -125,
      updatedAt: now.toISOString() }], ...overrides };
}

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-nba-builder-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('stores private per-member builder, warns on shared game, removes and clears', async t => {
  const root = await tempRoot(t);
  const one = { team: 'Dallas', player: 'Luka Doncic', stat: 'points', side: 'over', line: 25.5 };
  const two = { team: 'Dallas', player: 'Kyrie Irving', stat: 'assists', side: 'over', line: 5.5 };
  const research = async args => fixture(args);
  await addNbaBuilderLeg({ ...base, root, query: one, research });
  const added = await addNbaBuilderLeg({ ...base, root, query: two, research });
  assert.equal(added.legs.length, 2);
  assert.match(added.warnings.join(' '), /Shared game/);
  assert.equal(added.combinedProbability, null);
  assert.equal(added.combinedPayout, null);
  assert.match(formatNbaBuilder(added), /No combined sportsbook quote or probability/);
  const reloaded = await getNbaBuilder({ root, userId, now });
  assert.equal(reloaded.legs.length, 2);
  assert.equal((await getNbaBuilder({ root, userId: '123456789012345679', now })).legs.length, 0);
  const directory = path.join(root, 'trends-builders');
  const [file] = await fs.readdir(directory);
  assert.doesNotMatch(file, new RegExp(userId));
  assert.equal((await fs.stat(path.join(directory, file))).mode & 0o777, 0o600);
  assert.equal((await removeNbaBuilderLeg({ root, userId, now, number: 1 })).legs.length, 1);
  assert.equal((await clearNbaBuilder({ root, userId, now })).legs.length, 0);
});

test('rejects unverified, stale and duplicate exact props', async t => {
  const root = await tempRoot(t);
  const query = { team: 'Dallas', player: 'Luka Doncic', stat: 'points', side: 'over', line: 25.5 };
  await assert.rejects(addNbaBuilderLeg({ ...base, root, query: { ...query, line: '' },
    research: async () => fixture(query) }), /exact current line/);
  await assert.rejects(addNbaBuilderLeg({ ...base, root, query,
    research: async args => fixture(args, { offers: [] }) }), /No fresh exact-line offer/);
  await assert.rejects(addNbaBuilderLeg({ ...base, root, query,
    research: async args => fixture(args, { availability: { status: 'unconfirmed' } }) }), /availability/);
  await assert.rejects(addNbaBuilderLeg({ ...base, root, query,
    research: async args => fixture(args, { marketCheckedAt: '2026-11-15T01:50:00.000Z' }) }), /market check expired/);
  const research = async args => fixture(args);
  await addNbaBuilderLeg({ ...base, root, query, research });
  await assert.rejects(addNbaBuilderLeg({ ...base, root, query, research }), /already in the builder/);
});

test('expires without recycling stale odds and rechecks every leg before review', async t => {
  const root = await tempRoot(t);
  const queries = [
    { team: 'Dallas', player: 'Luka Doncic', stat: 'points', side: 'over', line: 25.5 },
    { team: 'Dallas', player: 'Kyrie Irving', stat: 'assists', side: 'over', line: 5.5 }
  ];
  for (const query of queries) await addNbaBuilderLeg({ ...base, root, query,
    research: async args => fixture(args) });
  let called = false;
  const combo = await reviewNbaBuilder({ ...base, root, research: async ({ rawLegs }) => {
    called = true;
    assert.equal(rawLegs.length, 2);
    return { legs: queries.map(query => fixture(query)), commonBook: 'example',
      warnings: ['Shared game: selections may be correlated'], checkedAt: now.toISOString(),
      combinedProbability: 0.8, combinedPayout: 123 };
  } });
  assert.equal(called, true);
  assert.equal(combo.combinedProbability, null);
  assert.equal(combo.combinedPayout, null);
  const later = new Date(now.valueOf() + 6 * 60_000);
  const stale = await getNbaBuilder({ root, userId, now: later });
  assert.equal(stale.legs.length, 2);
  assert.equal(stale.legs[0].quoteFresh, false);
  const expired = await getNbaBuilder({ root, userId,
    now: new Date(now.valueOf() + SESSION_MS + 1) });
  assert.equal(expired.legs.length, 0);
});
