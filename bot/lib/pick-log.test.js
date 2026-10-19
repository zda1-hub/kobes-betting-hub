const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { appendOfficialPick, appendOrRetryPermissionFailedPick, netUnitsFor, readPickLog, updateOfficialPick } = require('./pick-log');

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

test('retries only a definite permission failure with no Discord post', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kobe-pick-retry-'));
  const logPath = path.join(directory, 'pick-log.csv');
  const entry = {
    pick_id: '20261007-NFL-001', operating_date: '2026-10-07',
    published_at: '2026-10-07T15:00:00.000Z', destination: '#free-picks', result: 'PENDING'
  };
  try {
    await appendOfficialPick(entry, logPath);
    await updateOfficialPick(entry.pick_id, { status: 'POST_FAILED', notes: 'Discord post failed: Missing Permissions' }, logPath);
    await appendOrRetryPermissionFailedPick(entry, logPath);
    assert.equal((await readPickLog(logPath))[0].status, 'PUBLISHING');
    await assert.rejects(appendOrRetryPermissionFailedPick(entry, logPath), /already exists/);
    await updateOfficialPick(entry.pick_id, { status: 'POST_FAILED', post_reference: 'https://discord.com/channels/1/2/3', notes: 'Discord post failed: Missing Permissions' }, logPath);
    await assert.rejects(appendOrRetryPermissionFailedPick(entry, logPath), /already exists/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('simultaneous approvals preserve every pick and its later Discord receipt', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kobe-pick-concurrent-'));
  const logPath = path.join(directory, 'pick-log.csv');
  const entries = Array.from({ length: 24 }, (_, index) => ({
    pick_id: `20261018-NFL-${String(index + 1).padStart(3, '0')}`,
    operating_date: '2026-10-18', published_at: '2026-10-18T18:00:00.000Z', destination: '#expert-picks',
    selection: `Selection ${index + 1}`, result: 'PENDING'
  }));
  try {
    await Promise.all(entries.map((entry) => appendOrRetryPermissionFailedPick(entry, logPath)));
    await Promise.all(entries.map((entry) => updateOfficialPick(entry.pick_id, {
      status: 'PUBLISHED', post_reference: `https://discord.com/channels/1/2/${entry.pick_id}`
    }, logPath)));
    const rows = await readPickLog(logPath);
    assert.equal(rows.length, entries.length);
    for (const entry of entries) {
      const row = rows.find((candidate) => candidate.pick_id === entry.pick_id);
      assert.equal(row?.selection, entry.selection);
      assert.equal(row?.status, 'PUBLISHED');
      assert.equal(row?.post_reference, `https://discord.com/channels/1/2/${entry.pick_id}`);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
