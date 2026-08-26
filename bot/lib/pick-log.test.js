const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { appendOfficialPick, netUnitsFor, readPickLog, updateOfficialPick } = require('./pick-log');

test('keeps exact published terms and a Discord reference in the canonical log', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kobe-pick-log-'));
  const logPath = path.join(directory, 'pick-log.csv');
  await appendOfficialPick({
    pick_id: '20260825-BASEBALL-001',
    operating_date: '2026-08-25',
    event: 'Mets at Dodgers',
    sport: 'baseball',
    selection: 'Player A',
    published_line: 'OVER 1.5 hits',
    published_odds_american: '+120',
    units_risked: '1',
    published_at: '2026-08-25T17:00:00.000Z',
    destination: '#daily-free-play',
    post_reference: 'https://discord.com/channels/1/2/3',
    result: 'PENDING'
  }, logPath);
  const updated = await updateOfficialPick('20260825-BASEBALL-001', { result: 'W' }, logPath);
  assert.equal(netUnitsFor(updated), 1.2);
  const [row] = await readPickLog(logPath);
  assert.equal(row.post_reference, 'https://discord.com/channels/1/2/3');
  assert.equal(row.published_line, 'OVER 1.5 hits');
  await fs.rm(directory, { recursive: true, force: true });
});
