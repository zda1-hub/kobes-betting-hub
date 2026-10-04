const fs = require('node:fs/promises');
const path = require('node:path');
const { isPublishedRow } = require('./recap');
const { verified } = require('./free-pick-results');
const { distinctCapperWagers } = require('./capper-recap');
const { publicationGradeHold } = require('./recap-review');
const { sourcePacketPath, expandPublication, wagerFingerprint } = require('./wager-ledger');

const pending = row => ({ ...row, result: 'PENDING', result_verified_source: '', result_verified_at: '', net_units: '' });

// Read existing evidence only. Public sync must never grade, checkpoint, or
// substitute an audit ledger for the worker's canonical wager ledger.
async function publicResultRows({ rows, root, directory, readFile = fs.readFile }) {
  const ledgers = new Map();
  async function savedLedger(date) {
    if (!ledgers.has(date)) {
      let ledger;
      try { ledger = JSON.parse(await readFile(path.join(directory, `wager-results-${date}.json`), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; ledger = { version: 1, wagers: {} }; }
      if (ledger.version !== 1 || !ledger.wagers || typeof ledger.wagers !== 'object' || Array.isArray(ledger.wagers)) throw new Error('Invalid canonical wager ledger.');
      ledgers.set(date, ledger);
    }
    return ledgers.get(date);
  }
  const resolved = [];
  for (const row of rows) {
    if (!isPublishedRow(row) || !/^\d{4}-\d{2}-\d{2}$/.test(row.operating_date || '')) continue;
    const packetPath = sourcePacketPath(root, row.pick_id);
    let packet;
    if (packetPath) {
      try { packet = JSON.parse(await readFile(packetPath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const plays = packet?.analysis?.extraction?.plays;
    const grouped = Array.isArray(plays) && plays.length > 1;
    if (!grouped) {
      const hold = publicationGradeHold(row, packet);
      if (hold || (row.wager_scope && row.wager_scope !== 'individual')) { resolved.push(pending(row)); continue; }
      let single = { ...row, wager_scope: 'individual' };
      const child = !verified(row) && Array.isArray(plays) && plays.length === 1 ? expandPublication(row, packet)?.[0] : null;
      if (child) {
        const saved = (await savedLedger(row.operating_date)).wagers[child.pick_id];
        if (saved?.fingerprint === wagerFingerprint(child) && verified({ ...child, ...saved.result })) {
          const grade = saved.result;
          single = { ...single, result: grade.result, status: 'GRADED',
            score_or_outcome: grade.score_or_outcome || '', result_verified_source: grade.result_verified_source,
            result_verified_at: grade.result_verified_at, graded_by: grade.graded_by || '', net_units: grade.net_units ?? '' };
        }
      }
      resolved.push(single);
      continue;
    }
    const children = expandPublication(row, packet);
    if (!children) { resolved.push(pending(row)); continue; }
    const ledger = await savedLedger(row.operating_date);
    for (const child of children) {
      const saved = ledger.wagers[child.pick_id];
      if (!saved || saved.fingerprint !== wagerFingerprint(child)) { resolved.push(child); continue; }
      const grade = saved.result || {};
      resolved.push({ ...child,
        result: grade.result || 'PENDING', status: grade.status || 'PUBLISHED',
        score_or_outcome: grade.score_or_outcome || '',
        result_verified_source: grade.result_verified_source || '',
        result_verified_at: grade.result_verified_at || '',
        graded_by: grade.graded_by || '', net_units: grade.net_units ?? ''
      });
    }
  }
  const groups = new Map();
  for (const raw of resolved) {
    const row = verified(raw) ? raw : pending(raw);
    const source = String(row.source_name || 'Source not stated').trim().replace(/[\r\n]+/g, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${row.operating_date}:${source}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap(group => distinctCapperWagers(group).map(entry => entry.row));
}

module.exports = { publicResultRows };
