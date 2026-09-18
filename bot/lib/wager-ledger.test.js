const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { expandPublication, gradeWagerRows, sourcePacketPath } = require('./wager-ledger');
const row = { pick_id: '20260917-123-X', operating_date: '2026-09-17', selection: 'Angels ML -110 (10U)',
  league: 'MLB', status: 'PUBLISHED', published_at: '2026-09-17T18:00:00Z',
  post_reference: 'https://discord.com/channels/1/2/3', result: 'W', net_units: '20', units_risked: '10' };
const packet = { pick_id: row.pick_id, analysis: { extraction: { lossless_text_terms: true, plays: [
  { selection: row.selection }, { selection: 'Bills -5 -110 (2U)' }, { selection: 'Mets ML / Astros ML (2U Parlay)' }
] } } };

test('expands every exact source wager without copying first-wager results or units', () => {
  const children = expandPublication(row, packet);
  assert.equal(children.length, 3);
  assert.deepEqual(children.map(child => child.selection), packet.analysis.extraction.plays.map(play => play.selection));
  assert.deepEqual(children.map(child => child.result), ['PENDING', 'PENDING', 'PENDING']);
  assert.deepEqual(children.map(child => child.units_risked), ['10', '2', '']);
  assert.deepEqual(children.map(child => child.net_units), ['', '', '']);
  assert.equal(children[0].published_odds_american, '-110');
  assert.equal(children[1].published_odds_american, '-110');
  assert.equal(children[2].published_odds_american, '');
  assert.equal(children[2].pick_id, `${row.pick_id}-W003`);
  assert.equal(children[1].league, '', 'mixed-source siblings must not inherit first-wager MLB');
  assert.equal(children[1].event, '');
});

test('does not reconstruct rewritten publications or identity/first-selection mismatches', () => {
  assert.equal(expandPublication(row, { ...packet, pick_id: 'wrong' }), null);
  assert.equal(expandPublication({ ...row, selection: 'rewritten' }, packet), null);
  assert.equal(expandPublication(row, { ...packet, analysis: { extraction: { plays: packet.analysis.extraction.plays } } }), null);
});

test('source paths support Telegram and X and reject traversal', () => {
  assert.equal(sourcePacketPath('/queue', row.pick_id), '/queue/2026-09-17/20260917-123.json');
  assert.equal(sourcePacketPath('/queue', 'tg-20260917-123-4'), '/queue/2026-09-17/tg-20260917-123-4.json');
  assert.equal(sourcePacketPath('/queue', 'manual-20260917-aaaaaaaaaaaaaaaaaaaa'), '/queue/2026-09-17/manual-20260917-aaaaaaaaaaaaaaaaaaaa.json');
  assert.equal(sourcePacketPath('/queue', '../secret'), null);
});

test('checkpoints each verified wager and reuses it across restarts; changed terms stay pending', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-wagers-'));
  const file = path.join(directory, 'ledger.json');
  const source = sourcePacketPath(directory, row.pick_id);
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, JSON.stringify(packet));
  let calls = 0;
  const grade = async () => { calls++; return { status: 'GRADED', result: 'W', outcome: 'Final', source: 'https://www.espn.com/game/1' }; };
  const run = () => gradeWagerRows({ rows: [row], date: row.operating_date, root: directory, file, grade });
  const first = await run();
  assert.equal(first.rows.length, 3);
  assert.equal(first.rows[0].net_units, 10 * 100 / 110);
  await run();
  assert.equal(calls, 3);
  const changed = JSON.parse(JSON.stringify(packet));
  changed.analysis.extraction.plays[1].selection = 'Bills -6 -110 (2U)';
  await fs.writeFile(source, JSON.stringify(changed));
  const last = await run();
  assert.equal(calls, 3);
  assert.equal(last.rows[1].result, 'PENDING');
  assert.match(last.attempts.get(last.rows[1].pick_id).reason, /changed/);
});

test('never saves an unverified or invalid result; malformed ledger fails closed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-wagers-'));
  const source = sourcePacketPath(directory, row.pick_id);
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, JSON.stringify(packet));
  const file = path.join(directory, 'ledger.json');
  const result = await gradeWagerRows({ rows: [row], date: row.operating_date, root: directory, file,
    grade: async () => ({ status: 'GRADED', result: 'W' }) });
  assert.ok(result.rows.every(child => child.result === 'PENDING'));
  await fs.writeFile(file, '{bad');
  await assert.rejects(gradeWagerRows({ rows: [row], date: row.operating_date, root: directory, file, grade: async () => ({}) }));
});
