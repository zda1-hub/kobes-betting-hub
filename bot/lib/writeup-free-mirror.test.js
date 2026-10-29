const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { claimMirror, countMirrorClaims, mirrorMarker, readMirror, saveMirror } = require('./writeup-free-mirror');

test('one approved play has one durable free-share claim and one receipt', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kbh-free-share-'));
  try {
    const state = { pickId: '20261029-001-X', date: '2026-10-29', status: 'CLAIMED', sourceReference: 'source' };
    assert.equal(await claimMirror(root, state), true);
    assert.equal(await claimMirror(root, state), false);
    assert.equal(await countMirrorClaims(root, state.date), 1);
    assert.deepEqual(await readMirror(root, state.pickId), state);
    await saveMirror(root, { ...state, status: 'PUBLISHED', freeReference: 'free-post' });
    assert.equal((await readMirror(root, state.pickId)).freeReference, 'free-post');
    assert.equal(await countMirrorClaims(root, state.date), 1);
    assert.equal(await countMirrorClaims(root, '2026-10-30'), 0);
    assert.match(mirrorMarker(state.pickId), /20261029-001-X/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
