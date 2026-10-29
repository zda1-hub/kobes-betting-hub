const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

function mirrorPath(root, pickId) {
  return path.join(root, `${createHash('sha256').update(String(pickId)).digest('hex')}.json`);
}

function mirrorMarker(pickId) {
  return `KBH shared play · Pick ID: ${pickId}`;
}

async function readMirror(root, pickId) {
  try { return JSON.parse(await fs.readFile(mirrorPath(root, pickId), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function claimMirror(root, state) {
  await fs.mkdir(root, { recursive: true });
  const file = mirrorPath(root, state.pickId);
  let handle;
  try { handle = await fs.open(file, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try { await handle.writeFile(`${JSON.stringify(state)}\n`); }
  finally { await handle.close(); }
  return true;
}

async function saveMirror(root, state) {
  await fs.mkdir(root, { recursive: true });
  const file = mirrorPath(root, state.pickId);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function countMirrorClaims(root, date) {
  let files;
  try { files = await fs.readdir(root); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  let count = 0;
  for (const file of files.filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
    const state = JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    if (state.date === date && ['CLAIMED', 'PUBLISHED'].includes(state.status)) count += 1;
  }
  return count;
}

module.exports = { claimMirror, countMirrorClaims, mirrorMarker, readMirror, saveMirror };
