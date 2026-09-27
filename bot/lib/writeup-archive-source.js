const fs = require('node:fs/promises');
const { sourcePacketPath } = require('./wager-ledger');
const { independentWriteupPacket, sourceEvidence } = require('./source-review');

async function archivedWriteupSource(root, row, { readFile = fs.readFile } = {}) {
  const file = sourcePacketPath(root, row.pick_id);
  if (!file) return '';
  let packet;
  try { packet = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  const canonical = value => String(value || '').replace(/-X$/, '');
  if (canonical(packet.pick_id) !== canonical(row.pick_id)) return '';
  return sourceEvidence(independentWriteupPacket(packet)).join('\n');
}
module.exports = { archivedWriteupSource };
