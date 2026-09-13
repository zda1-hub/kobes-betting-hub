import { pathToFileURL } from 'node:url';

export const DEFAULT_ENDPOINTS = Object.freeze({
  checkoutHealth: 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev/health',
  publisherHealth: 'https://bettinghub-publisher.kobedirwin.workers.dev/health',
  currentFreePick: 'https://bettinghub-publisher.kobedirwin.workers.dev/api/free-pick/current',
  publicFreePick: 'https://kobesbettinghub.com/free-pick',
});

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function validatePublishedDate(value) {
  const date = requiredString(value, 'publishedDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error('publishedDate must be a valid YYYY-MM-DD date');
  }
}

export function validateCheckoutHealth(payload) {
  requiredObject(payload, 'checkout health response');
  if (payload.ok !== true) throw new Error('checkout health response must contain ok: true');
}

export function validatePublisherHealth(payload) {
  requiredObject(payload, 'publisher health response');
  if (payload.service !== 'bettinghub-publisher') throw new Error('publisher health response has an unexpected service');
  if (payload.status !== 'ready') throw new Error('publisher health response must report status: ready');
  if (payload.freePickReady !== true) throw new Error('publisher health response must report freePickReady: true');
  if (typeof payload.xConnected !== 'boolean') throw new Error('publisher health response must contain boolean xConnected');
}

export function validateCurrentFreePick(payload) {
  requiredObject(payload, 'current Free Pick response');
  validatePublishedDate(payload.publishedDate);
  requiredString(payload.caption, 'caption');
  const details = requiredObject(payload.details, 'details');

  if (payload.imageUrl !== null && payload.imageUrl !== undefined) {
    const imageUrl = requiredString(payload.imageUrl, 'imageUrl');
    let parsed;
    try { parsed = new URL(imageUrl); } catch { throw new Error('imageUrl must be an absolute URL or null'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('imageUrl must use HTTP(S)');
  } else if (![details.selection, details.pick].some((value) => typeof value === 'string' && value.trim())) {
    throw new Error('a text-only Free Pick must contain details.selection or details.pick');
  }
}

function contentType(response) {
  return String(response.headers?.get?.('content-type') || '').toLowerCase();
}

async function readText(response, label) {
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error(`${label} response is larger than ${MAX_BODY_BYTES} bytes`);
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error(`${label} response is larger than ${MAX_BODY_BYTES} bytes`);
  return body;
}

async function get(fetchFn, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: '*/*', 'User-Agent': 'kobes-betting-hub-production-smoke/1.0' },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(fetchFn, url, label, timeoutMs) {
  const response = await get(fetchFn, url, timeoutMs);
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  if (!contentType(response).includes('application/json')) throw new Error(`${label} did not return JSON`);
  const body = await readText(response, label);
  try { return JSON.parse(body); } catch { throw new Error(`${label} returned invalid JSON`); }
}

function findFreePickClientAsset(html, pageUrl) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  const source = scripts.find((candidate) => /(?:^|\/)free-pick\.js(?:[?#]|$)/.test(candidate));
  if (!source) throw new Error('public Free Pick HTML does not reference free-pick.js');
  return new URL(source, pageUrl).href;
}

async function checkPublicPage(fetchFn, url, timeoutMs) {
  const response = await get(fetchFn, url, timeoutMs);
  if (!response.ok) throw new Error(`public Free Pick page returned HTTP ${response.status}`);
  if (!contentType(response).includes('text/html')) throw new Error('public Free Pick page did not return HTML');
  const html = await readText(response, 'public Free Pick page');
  for (const hook of ['data-free-pick-date', 'data-free-pick-caption', 'data-free-pick-status']) {
    if (!html.includes(hook)) throw new Error(`public Free Pick HTML is missing ${hook}`);
  }
  return findFreePickClientAsset(html, response.url || url);
}

async function checkClientAsset(fetchFn, url, timeoutMs) {
  const response = await get(fetchFn, url, timeoutMs);
  if (!response.ok) throw new Error(`Free Pick client asset returned HTTP ${response.status}`);
  const type = contentType(response);
  if (type && !/(javascript|ecmascript|text\/plain)/.test(type)) {
    throw new Error(`Free Pick client asset returned unexpected content-type ${type}`);
  }
  const source = await readText(response, 'Free Pick client asset');
  if (!source.includes('/api/free-pick/current')) throw new Error('Free Pick client asset does not load the current Free Pick endpoint');
}

export async function runProductionSmoke({
  fetchFn = globalThis.fetch,
  endpoints = DEFAULT_ENDPOINTS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchFn !== 'function') throw new Error('A fetch implementation is required');

  const run = async (name, operation) => {
    const startedAt = Date.now();
    try {
      const value = await operation();
      return { result: { name, ok: true, durationMs: Date.now() - startedAt }, value };
    } catch (error) {
      return { result: { name, ok: false, durationMs: Date.now() - startedAt, error: error?.message || String(error) } };
    }
  };

  const initialChecks = await Promise.all([
    run('checkout health', async () => validateCheckoutHealth(await getJson(fetchFn, endpoints.checkoutHealth, 'checkout health', timeoutMs))),
    run('publisher health', async () => validatePublisherHealth(await getJson(fetchFn, endpoints.publisherHealth, 'publisher health', timeoutMs))),
    run('current Free Pick API', async () => validateCurrentFreePick(await getJson(fetchFn, endpoints.currentFreePick, 'current Free Pick API', timeoutMs))),
    run('public Free Pick page', () => checkPublicPage(fetchFn, endpoints.publicFreePick, timeoutMs)),
  ]);
  const results = initialChecks.map(({ result }) => result);
  const clientAssetUrl = initialChecks[3].value;

  if (clientAssetUrl) results.push((await run('Free Pick client asset', () => checkClientAsset(fetchFn, clientAssetUrl, timeoutMs))).result);
  else results.push({ name: 'Free Pick client asset', ok: false, durationMs: 0, error: 'not checked because the public page check failed' });

  return { ok: results.every((result) => result.ok), results };
}

function endpointsFromEnvironment() {
  return {
    checkoutHealth: process.env.PRODUCTION_SMOKE_CHECKOUT_HEALTH_URL || DEFAULT_ENDPOINTS.checkoutHealth,
    publisherHealth: process.env.PRODUCTION_SMOKE_PUBLISHER_HEALTH_URL || DEFAULT_ENDPOINTS.publisherHealth,
    currentFreePick: process.env.PRODUCTION_SMOKE_FREE_PICK_API_URL || DEFAULT_ENDPOINTS.currentFreePick,
    publicFreePick: process.env.PRODUCTION_SMOKE_FREE_PICK_PAGE_URL || DEFAULT_ENDPOINTS.publicFreePick,
  };
}

async function main() {
  const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('PRODUCTION_SMOKE_TIMEOUT_MS must be a positive number');
  const report = await runProductionSmoke({ endpoints: endpointsFromEnvironment(), timeoutMs });
  for (const result of report.results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name} (${result.durationMs}ms)${result.error ? `: ${result.error}` : ''}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL production smoke: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
