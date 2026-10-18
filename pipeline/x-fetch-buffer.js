const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function readBuffer(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeBuffer(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

function newestId(ids) {
  return ids.filter(id => /^\d+$/.test(String(id || '')))
    .map(String).sort((a, b) => b.length - a.length || b.localeCompare(a))[0] || '';
}

// Fetch progress is durable independently of downstream processing progress.
// Never advance the fetch cursor without saving every returned post first.
async function fetchBufferedPosts({ file, epoch, sinceId, startTime, fetchPage }) {
  const previous = await readBuffer(file);
  const sameEpoch = previous?.epoch === epoch;
  if (previous && (previous.version !== 1 || typeof previous.epoch !== 'string' || !Array.isArray(previous.pages))) {
    throw new Error('Invalid X fetch buffer; refusing to discard deferred posts.');
  }
  const pendingPages = sameEpoch ? previous.pages : [];
  const cursor = sameEpoch ? previous.since_id : sinceId;
  const newPages = [];
  let nextToken;
  const tokens = new Set();
  do {
    const page = await fetchPage({ sinceId: cursor || undefined,
      startTime: cursor ? undefined : startTime, nextToken });
    if (!page || typeof page !== 'object' || (page.data !== undefined && !Array.isArray(page.data))
        || page.errors?.length) {
      throw new Error('Incomplete X fetch response; fetch cursor was not advanced.');
    }
    newPages.push(page);
    nextToken = page.meta?.next_token;
    if (nextToken && tokens.has(nextToken)) throw new Error('Repeated X pagination token; cursor was not advanced.');
    if (nextToken) tokens.add(nextToken);
  } while (nextToken);
  const seen = new Set();
  const pages = [...pendingPages, ...newPages].map(page => ({
    ...page, data: (page.data || []).filter(post => {
      if (!post.id || seen.has(String(post.id))) return false;
      seen.add(String(post.id)); return true;
    })
  })).filter(page => page.data.length);
  const highWater = newestId([cursor, ...newPages.flatMap(page =>
    [page.meta?.newest_id, ...(page.data || []).map(post => post.id)])]);
  await writeBuffer(file, { version: 1, epoch, since_id: highWater,
    fetched_at: new Date().toISOString(), pages });
  return { pages, newest_id: highWater, pending: seen.size,
    fetched: newPages.reduce((total, page) => total + (page.data || []).length, 0) };
}

// Acknowledge only after the existing downstream commit succeeds. Crashes and
// failed commits therefore replay local data rather than paid X responses.
async function acknowledgeBufferedPosts(file, epoch, ids) {
  const state = await readBuffer(file);
  if (!state || state.epoch !== epoch) return;
  const handled = new Set([...ids].map(String));
  state.pages = state.pages.map(page => ({ ...page,
    data: page.data.filter(post => !handled.has(String(post.id)))
  })).filter(page => page.data.length);
  await writeBuffer(file, state);
}

module.exports = { fetchBufferedPosts, acknowledgeBufferedPosts };
