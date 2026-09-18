const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isPublishedRow } = require('./recap');
const { netUnitsFor, resultFor } = require('./pick-log');

function sourcePacketPath(root, id) {
  const match = String(id).match(/^(?:(\d{8})-\d+-X|tg-(\d{8})-\d+-\d+)$/);
  if (!match) return null;
  const date = match[1] || match[2];
  return path.join(root, `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, `${id.replace(/-X$/, '')}.json`);
}

function expandPublication(row, packet) {
  if (!packet || packet.pick_id !== row.pick_id) return null;
  const extraction = packet.analysis?.extraction;
  const plays = extraction?.plays;
  // Only lossless source terms can be reconstructed from the review packet.
  // Independently rewritten publications must not inherit source-only wagers.
  if (!extraction?.lossless_text_terms || !Array.isArray(plays) || !plays.length || plays.length > 30) return null;
  if (String(plays[0].selection || '').trim() !== String(row.selection || '').trim()) return null;
  if (plays.some(play => !String(play.selection || '').trim())) return null;
  return plays.map((play, index) => {
    const selection = String(play.selection).trim();
    const odds = selection.match(/(?:^|\s|\()([+-]\d{3,4})(?=\s|\)|$)/g) || [];
    const units = selection.match(/\((\d+(?:\.\d+)?)\s*U\)/i)?.[1] || '';
    return {
      ...row,
      parent_pick_id: row.pick_id,
      pick_id: `${row.pick_id}-W${String(index + 1).padStart(3, '0')}`,
      wager_scope: 'individual',
      selection,
      // Do not copy the first wager's terms or result onto any sibling.
      event: play.event || extraction.event || '',
      market: play.market || '',
      published_line: play.line || '',
      published_odds_american: play.odds_american || (odds.length === 1 ? odds[0].match(/[+-]\d+/)[0] : ''),
      units_risked: play.units || units,
      result: 'PENDING', status: 'PUBLISHED', net_units: '',
      score_or_outcome: '', result_verified_source: '', result_verified_at: '', graded_by: ''
    };
  });
}

function wagerFingerprint(row) {
  return createHash('sha256').update(JSON.stringify([
    row.parent_pick_id, row.pick_id, row.selection, row.event, row.league, row.sport, row.operating_date,
    row.market, row.published_line, row.published_odds_american, row.units_risked,
    row.post_reference
  ])).digest('hex');
}

async function readLedger(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value.version !== 1 || !value.wagers || Array.isArray(value.wagers)) throw new Error('Invalid wager ledger.');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, wagers: {} };
    throw error;
  }
}

async function saveLedger(file, ledger) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(ledger), { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function gradeWagerRows({ rows, date, root, file, grade, onAttempt = async () => {} }) {
  const ledger = await readLedger(file);
  const expanded = [];
  const attempts = new Map();
  for (const row of rows) {
    if (row.operating_date !== date || !isPublishedRow(row)) continue;
    const packetPath = sourcePacketPath(root, row.pick_id);
    let packet;
    if (packetPath) {
      try { packet = JSON.parse(await fs.readFile(packetPath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const children = expandPublication(row, packet);
    if (!children) { expanded.push(row); continue; }
    for (const child of children) {
      const fingerprint = wagerFingerprint(child);
      const saved = ledger.wagers[child.pick_id];
      if (saved && saved.fingerprint !== fingerprint) {
        attempts.set(child.pick_id, { status: 'PENDING', reason: 'Published wager terms changed; result reuse blocked.' });
        expanded.push(child);
        continue;
      }
      let current = saved ? { ...child, ...saved.result } : child;
      if (resultFor(current) === 'PENDING') {
        const attempt = await grade(current);
        attempts.set(child.pick_id, attempt);
        await onAttempt(row.pick_id, child.pick_id, attempt);
        if (attempt.status === 'GRADED' && ['W', 'L', 'P', 'V'].includes(attempt.result) && attempt.source) {
          current = { ...child, result: attempt.result, status: 'GRADED', score_or_outcome: attempt.outcome,
            result_verified_source: `ESPN final box score: ${attempt.source}`,
            result_verified_at: new Date().toISOString(), graded_by: 'auto:espn' };
          const net = netUnitsFor(current);
          if (net !== null) current.net_units = net;
          ledger.wagers[child.pick_id] = { fingerprint, result: {
            result: current.result, status: current.status, score_or_outcome: current.score_or_outcome,
            result_verified_source: current.result_verified_source, result_verified_at: current.result_verified_at,
            graded_by: current.graded_by, net_units: current.net_units
          } };
          // Checkpoint each settled wager, not only the complete grading batch.
          await saveLedger(file, ledger);
        }
      }
      expanded.push(current);
    }
  }
  return { rows: expanded, attempts };
}

module.exports = { expandPublication, gradeWagerRows, sourcePacketPath, wagerFingerprint };
