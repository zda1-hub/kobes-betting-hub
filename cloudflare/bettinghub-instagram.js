import { timingSafeEqual } from 'node:crypto';

const TARGET = 'kobesbettinhub';
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
const CALLBACK = '/auth/instagram/callback';
const COOKIE = '__Host-kbh-ig-state';
const MAX_JSON_BYTES = 65536;
const encoder = new TextEncoder();

class SafeError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}

function response(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      ...extra,
    },
  });
}
function json(value, status = 200) {
  return response(JSON.stringify(value), status, { 'content-type': 'application/json' });
}
function page(message, { invite, status = 200, cookie } = {}) {
  const form = invite ? `<form method="post" action="/auth/instagram/start"><input type="hidden" name="invite" value="${invite}"><button>Authorize @${TARGET}</button></form>` : '';
  return response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram connection · Kobe's Betting Hub</title><style>body{margin:0;background:#090909;color:#f4f0e8;font:18px/1.6 system-ui}main{max-width:620px;margin:10vh auto;padding:32px}h1{line-height:1.1}span{color:#ff6a00}button{background:#ff6a00;color:#090909;border:0;padding:18px 24px;font:700 18px system-ui;cursor:pointer}p{overflow-wrap:anywhere}</style><main><h1>Kobe's <span>Betting Hub</span></h1><h2>Instagram account connection</h2><p>${message}</p>${form}<p>This connection is limited to @${TARGET}. Story publishing is controlled separately; connecting does not publish a Story or send messages.</p></main></html>`, status, {
    'content-type': 'text/html; charset=utf-8', ...(cookie ? { 'set-cookie': cookie } : {}),
  });
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function equal(a, b) {
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))]);
  return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}
function origin(env) {
  try {
    const url = new URL(env.INSTAGRAM_PUBLIC_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new SafeError('INSTAGRAM_ORIGIN_NOT_CONFIGURED', 503); }
}
function configured(env) {
  try {
    origin(env);
    return Boolean(env.DB && /^\d+$/.test(env.INSTAGRAM_APP_ID || '') &&
      env.INSTAGRAM_APP_SECRET && env.INSTAGRAM_OPERATOR_SECRET?.length >= 32 &&
      /^[A-Za-z0-9+/]{43}=$/.test(env.INSTAGRAM_TOKEN_ENCRYPTION_KEY || '') &&
      /^v\d+\.0$/.test(env.INSTAGRAM_API_VERSION || ''));
  } catch { return false; }
}
async function operator(request, env) {
  const supplied = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1] || '';
  return Boolean(env.INSTAGRAM_OPERATOR_SECRET?.length >= 32 && supplied && await equal(supplied, env.INSTAGRAM_OPERATOR_SECRET));
}
function browserCookie(request) {
  return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
function cookie(value, age = 600) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
}

async function schema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS instagram_connect_invites (digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, consumed_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS instagram_oauth_states (digest TEXT PRIMARY KEY, browser_digest TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS instagram_connections (target TEXT PRIMARY KEY CHECK (target = '${TARGET}'), account_id TEXT NOT NULL, encrypted_token TEXT NOT NULL, granted_scopes TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, checked_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS instagram_story_deliveries (pick_id TEXT PRIMARY KEY, operating_date TEXT NOT NULL, story_url TEXT NOT NULL, state TEXT NOT NULL, container_id TEXT, media_id TEXT, attempted_at INTEGER, published_at INTEGER, last_error TEXT, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS instagram_story_date ON instagram_story_deliveries(operating_date)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS instagram_connection_audit (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, occurred_at INTEGER NOT NULL, event TEXT NOT NULL, endpoint_class TEXT, method TEXT, outcome TEXT NOT NULL, http_status INTEGER, latency_ms INTEGER, provider_request_id TEXT, response_shape_sha256 TEXT, worker_version TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS instagram_audit_operation ON instagram_connection_audit(operation_id, occurred_at)`),
    env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS instagram_audit_no_update BEFORE UPDATE ON instagram_connection_audit BEGIN SELECT RAISE(ABORT, 'instagram audit is append-only'); END`),
    env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS instagram_audit_no_delete BEFORE DELETE ON instagram_connection_audit BEGIN SELECT RAISE(ABORT, 'instagram audit is append-only'); END`),
  ]);
}
function auditStatement(env, operation, event, outcome, details = {}) {
  return env.DB.prepare(`INSERT INTO instagram_connection_audit (id, operation_id, occurred_at, event, endpoint_class, method, outcome, http_status, latency_ms, provider_request_id, response_shape_sha256, worker_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), operation, Date.now(), event, details.endpoint || null,
    details.method || null, outcome, details.status ?? null, details.latency ?? null,
    details.requestId || null, details.shapeHash || null, env.CF_VERSION_METADATA?.id || null,
  );
}
async function audit(env, operation, event, outcome, details) {
  await auditStatement(env, operation, event, outcome, details).run();
}
function shape(value, depth = 0) {
  if (depth > 6) return '<depth-limit>';
  if (value === null) return null;
  if (Array.isArray(value)) return value.slice(0, 10).map(item => shape(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().slice(0, 50).map(key => [key, shape(value[key], depth + 1)]));
  return `<${typeof value}>`;
}
async function readJson(body) {
  if (!body) throw new SafeError('PROVIDER_INVALID_RESPONSE', 502);
  const reader = body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_JSON_BYTES) throw new SafeError('PROVIDER_RESPONSE_TOO_LARGE', 502);
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SafeError) throw error;
    throw new SafeError('PROVIDER_INVALID_RESPONSE', 502);
  } finally { reader.releaseLock(); }
}
async function provider(env, operation, endpoint, init = {}, fetchImpl = fetch) {
  // Only controlled endpoint labels and value-free JSON shapes enter the ledger.
  const method = init.method || 'GET';
  const started = Date.now();
  await audit(env, operation, 'PROVIDER_CALL', 'ATTEMPTED', { endpoint, method });
  let result, data;
  try {
    result = await fetchImpl(endpointUrl(endpoint, env, init.token), {
      ...init, token: undefined, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    data = await readJson(result.body);
  } catch (error) {
    await audit(env, operation, 'PROVIDER_CALL', 'FAILED', { endpoint, method, status: result?.status, latency: Date.now() - started });
    throw error instanceof SafeError ? error : new SafeError('INSTAGRAM_PROVIDER_UNAVAILABLE', 502);
  }
  const succeeded = result.ok && data && typeof data === 'object' && !data.error && !data.error_type;
  await audit(env, operation, 'PROVIDER_CALL', succeeded ? 'SUCCEEDED' : 'HTTP_ERROR', {
    endpoint, method, status: result.status, latency: Date.now() - started,
    requestId: result.headers.get('x-fb-trace-id'), shapeHash: await hash(JSON.stringify(shape(data))),
  });
  if (!succeeded) throw new SafeError('INSTAGRAM_PROVIDER_REJECTED', 502);
  return data;
}
function endpointUrl(endpoint, env, token) {
  if (endpoint === 'code_exchange') return 'https://api.instagram.com/oauth/access_token';
  if (endpoint === 'profile') {
    const url = new URL(`https://graph.instagram.com/${env.INSTAGRAM_API_VERSION}/me`);
    url.searchParams.set('fields', 'user_id,username,account_type');
    url.searchParams.set('access_token', token);
    return url.toString();
  }
  if (endpoint.startsWith('container_status:')) {
    const id = endpoint.slice('container_status:'.length);
    if (!/^\d+$/.test(id)) throw new SafeError('INSTAGRAM_CONTAINER_ID_INVALID', 500);
    const url = new URL(`https://graph.instagram.com/${env.INSTAGRAM_API_VERSION}/${id}`);
    url.searchParams.set('fields', 'status_code');
    url.searchParams.set('access_token', token);
    return url.toString();
  }
  const url = new URL(`https://graph.instagram.com/${endpoint === 'long_token_exchange' ? 'access_token' : 'refresh_access_token'}`);
  url.searchParams.set('grant_type', endpoint === 'long_token_exchange' ? 'ig_exchange_token' : 'ig_refresh_token');
  url.searchParams.set('access_token', token);
  if (endpoint === 'long_token_exchange') url.searchParams.set('client_secret', env.INSTAGRAM_APP_SECRET);
  return url.toString();
}

function phoenixDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function publishingEnabled(env) {
  return String(env.INSTAGRAM_PUBLISHING_ENABLED || '').toLowerCase() === 'true';
}

function publicationDateAllowed(env, operatingDate) {
  const notBefore = String(env.INSTAGRAM_NOT_BEFORE_DATE || '9999-12-31');
  return /^\d{4}-\d{2}-\d{2}$/.test(notBefore) && operatingDate >= notBefore;
}

async function providerPost(env, operation, endpoint, fields, fetchImpl = fetch) {
  const started = Date.now();
  await audit(env, operation, 'PROVIDER_CALL', 'ATTEMPTED', { endpoint, method: 'POST' });
  let result;
  try {
    const url = endpoint === 'story_create'
      ? `https://graph.instagram.com/${env.INSTAGRAM_API_VERSION}/${fields.accountId}/media`
      : `https://graph.instagram.com/${env.INSTAGRAM_API_VERSION}/${fields.accountId}/media_publish`;
    const body = new URLSearchParams(endpoint === 'story_create'
      ? { image_url: fields.storyUrl, media_type: 'STORIES', access_token: fields.token }
      : { creation_id: fields.containerId, access_token: fields.token });
    result = await fetchImpl(url, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const data = await readJson(result.body);
    const succeeded = result.ok && /^\d+$/.test(String(data?.id || '')) && !data.error;
    await audit(env, operation, 'PROVIDER_CALL', succeeded ? 'SUCCEEDED' : 'HTTP_ERROR', {
      endpoint, method: 'POST', status: result.status, latency: Date.now() - started,
      requestId: result.headers.get('x-fb-trace-id'), shapeHash: await hash(JSON.stringify(shape(data))),
    });
    if (!succeeded) throw new SafeError('INSTAGRAM_PROVIDER_REJECTED', 502);
    return String(data.id);
  } catch (error) {
    if (!result) await audit(env, operation, 'PROVIDER_CALL', 'FAILED', { endpoint, method: 'POST', latency: Date.now() - started });
    throw error instanceof SafeError ? error : new SafeError('INSTAGRAM_PROVIDER_UNAVAILABLE', 502);
  }
}

async function currentFreePick(env, fetchImpl = fetch) {
  const origin = String(env.FREE_PICK_API_ORIGIN || 'https://bettinghub-publisher.kobedirwin.workers.dev').replace(/\/$/, '');
  let response;
  try {
    response = await fetchImpl(`${origin}/api/free-pick/current`, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  } catch { throw new SafeError('FREE_PICK_LOOKUP_FAILED', 502); }
  if (!response.ok) throw new SafeError('FREE_PICK_NOT_READY', 409);
  let data;
  try { data = await readJson(response.body); }
  catch { throw new SafeError('FREE_PICK_RESPONSE_INVALID', 502); }
  const pickId = String(data?.pickId || '');
  const operatingDate = String(data?.publishedDate || '');
  const storyUrl = String(data?.storyUrl || '');
  if (!/^[A-Za-z0-9_-]{4,160}$/.test(pickId) || !/^\d{4}-\d{2}-\d{2}$/.test(operatingDate) || !storyUrl.startsWith(`${origin}/media/free-pick/story/`)) throw new SafeError('FREE_PICK_STORY_INVALID', 409);
  if (operatingDate !== phoenixDate()) throw new SafeError('FREE_PICK_NOT_TODAY', 409);
  return { pickId, operatingDate, storyUrl };
}

async function deliverCurrentStory(env, fetchImpl = fetch) {
  if (!configured(env) || !publishingEnabled(env)) return { status: 'disabled' };
  await schema(env);
  const connection = await env.DB.prepare('SELECT * FROM instagram_connections WHERE target = ?').bind(TARGET).first();
  if (!connection || connection.expires_at <= Date.now()) return { status: 'not_connected' };
  const pick = await currentFreePick(env, fetchImpl);
  if (!publicationDateAllowed(env, pick.operatingDate)) return { status: 'before_activation_date' };
  let row = await env.DB.prepare('SELECT * FROM instagram_story_deliveries WHERE pick_id = ?').bind(pick.pickId).first();
  if (row?.state === 'published') return { status: 'published', mediaId: row.media_id };
  if (row && !['container_created'].includes(row.state)) return { status: row.state };
  const operation = crypto.randomUUID();
  let token;
  try { token = await decrypt(connection.encrypted_token, env); }
  catch { throw new SafeError('INSTAGRAM_TOKEN_DECRYPT_FAILED', 503); }
  if (!row) {
    const reserved = await env.DB.prepare(`INSERT INTO instagram_story_deliveries (pick_id, operating_date, story_url, state, attempted_at, updated_at) VALUES (?, ?, ?, 'creating_container', ?, ?) ON CONFLICT DO NOTHING`).bind(pick.pickId, pick.operatingDate, pick.storyUrl, Date.now(), Date.now()).run();
    if (reserved.meta.changes !== 1) return { status: 'already_reserved' };
    try {
      const containerId = await providerPost(env, operation, 'story_create', { accountId: connection.account_id, storyUrl: pick.storyUrl, token }, fetchImpl);
      await env.DB.prepare(`UPDATE instagram_story_deliveries SET state='container_created', container_id=?, updated_at=? WHERE pick_id=? AND state='creating_container'`).bind(containerId, Date.now(), pick.pickId).run();
      row = { ...pick, state: 'container_created', container_id: containerId };
    } catch (error) {
      await env.DB.prepare(`UPDATE instagram_story_deliveries SET state='held', last_error='CONTAINER_CREATE_UNCERTAIN', updated_at=? WHERE pick_id=?`).bind(Date.now(), pick.pickId).run();
      throw error;
    }
  }
  const container = await provider(env, operation, `container_status:${row.container_id}`, { token }, fetchImpl);
  if (String(container.status_code || '').toUpperCase() !== 'FINISHED') return { status: 'processing' };
  await env.DB.prepare(`UPDATE instagram_story_deliveries SET state='publishing', updated_at=? WHERE pick_id=? AND state='container_created'`).bind(Date.now(), pick.pickId).run();
  try {
    const mediaId = await providerPost(env, operation, 'story_publish', { accountId: connection.account_id, containerId: row.container_id, token }, fetchImpl);
    const now = Date.now();
    await env.DB.prepare(`UPDATE instagram_story_deliveries SET state='published', media_id=?, published_at=?, updated_at=?, last_error=NULL WHERE pick_id=?`).bind(mediaId, now, now, pick.pickId).run();
    await audit(env, operation, 'STORY_PUBLISHED', 'SUCCEEDED');
    return { status: 'published', mediaId };
  } catch (error) {
    await env.DB.prepare(`UPDATE instagram_story_deliveries SET state='held', last_error='PUBLISH_UNCERTAIN', updated_at=? WHERE pick_id=?`).bind(Date.now(), pick.pickId).run();
    throw error;
  }
}
function single(data) {
  if (Array.isArray(data?.data)) {
    if (data.data.length !== 1) throw new SafeError('INSTAGRAM_AMBIGUOUS_ACCOUNT', 403);
    return data.data[0];
  }
  if (!data || typeof data !== 'object') throw new SafeError('PROVIDER_INVALID_RESPONSE', 502);
  return data;
}
function identity(data, expectedId) {
  const profile = single(data);
  if (typeof profile.username !== 'string' || profile.username.toLowerCase() !== TARGET) throw new SafeError('WRONG_INSTAGRAM_ACCOUNT_USE_KOBESBETTINHUB', 403);
  if (String(profile.account_type).toUpperCase() !== 'BUSINESS') throw new SafeError('INSTAGRAM_BUSINESS_ACCOUNT_REQUIRED', 403);
  if (typeof profile.user_id !== 'string' || !/^\d+$/.test(profile.user_id)) throw new SafeError('INSTAGRAM_ACCOUNT_ID_MISSING', 502);
  if (expectedId && String(profile.user_id) !== expectedId) throw new SafeError('INSTAGRAM_ACCOUNT_ID_CHANGED', 409);
  return String(profile.user_id);
}
function tokenResult(data) {
  const token = single(data);
  if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192 || !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0 || token.expires_in > 90 * 86400) throw new SafeError('INSTAGRAM_TOKEN_EXPIRY_INVALID', 502);
  return token;
}
async function cipherKey(env) {
  return crypto.subtle.importKey('raw', Uint8Array.from(atob(env.INSTAGRAM_TOKEN_ENCRYPTION_KEY), char => char.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
async function encrypt(token, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`instagram:${TARGET}`) }, await cipherKey(env), encoder.encode(token));
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
async function decrypt(value, env) {
  const [iv, ciphertext] = value.split('.').map(part => Uint8Array.from(atob(part), char => char.charCodeAt(0)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`instagram:${TARGET}`) }, await cipherKey(env), ciphertext));
}

async function connect(request, env, operation, fetchImpl) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const browser = browserCookie(request);
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser)) throw new SafeError('INVALID_OR_EXPIRED_INSTAGRAM_STATE', 403);
  const stateDigest = await hash(state);
  const claimedAt = Date.now();
  const claimed = await env.DB.prepare(`UPDATE instagram_oauth_states SET consumed_at = ? WHERE digest = ? AND browser_digest = ? AND consumed_at IS NULL AND expires_at > ? RETURNING digest`).bind(claimedAt, stateDigest, await hash(browser), claimedAt).first();
  if (!claimed) throw new SafeError('INVALID_OR_EXPIRED_INSTAGRAM_STATE', 403);
  if (url.searchParams.has('error')) throw new SafeError('INSTAGRAM_AUTHORIZATION_DECLINED', 403);
  const code = url.searchParams.get('code') || '';
  if (!code || code.length > 4096) throw new SafeError('INSTAGRAM_AUTHORIZATION_CODE_MISSING');
  const form = new FormData();
  for (const [name, value] of Object.entries({ client_id: env.INSTAGRAM_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET, grant_type: 'authorization_code', redirect_uri: `${origin(env)}${CALLBACK}`, code })) form.set(name, value);
  const short = single(await provider(env, operation, 'code_exchange', { method: 'POST', body: form }, fetchImpl));
  const granted = Array.isArray(short.permissions) ? short.permissions : String(short.permissions || '').split(/[,\s]+/);
  if (!SCOPES.every(scope => granted.includes(scope))) throw new SafeError('INSTAGRAM_REQUIRED_PERMISSIONS_NOT_GRANTED', 403);
  if (typeof short.access_token !== 'string' || !short.access_token || short.access_token.length > 8192) throw new SafeError('INSTAGRAM_TOKEN_MISSING', 502);
  const long = tokenResult(await provider(env, operation, 'long_token_exchange', { token: short.access_token }, fetchImpl));
  const old = await env.DB.prepare('SELECT account_id FROM instagram_connections WHERE target = ?').bind(TARGET).first();
  const accountId = identity(await provider(env, operation, 'profile', { token: long.access_token }, fetchImpl), old?.account_id);
  const now = Date.now();
  // Recheck state inside the write: disconnect/expiry during provider calls must
  // not allow an in-flight callback to reinstall a removed credential.
  const stored = await env.DB.prepare(`INSERT INTO instagram_connections (target, account_id, encrypted_token, granted_scopes, issued_at, expires_at, checked_at) SELECT ?, ?, ?, ?, ?, ?, ? FROM instagram_oauth_states WHERE digest = ? AND consumed_at = ? AND expires_at > ? ON CONFLICT(target) DO UPDATE SET encrypted_token = excluded.encrypted_token, granted_scopes = excluded.granted_scopes, issued_at = excluded.issued_at, expires_at = excluded.expires_at, checked_at = excluded.checked_at WHERE instagram_connections.account_id = excluded.account_id RETURNING target`).bind(TARGET, accountId, await encrypt(long.access_token, env), JSON.stringify(SCOPES), now, now + long.expires_in * 1000, now, stateDigest, claimedAt, now).first();
  if (!stored) throw new SafeError('INSTAGRAM_CONNECTION_CHANGED_RECHECK', 409);
  await audit(env, operation, 'ACCOUNT_CONNECTED', 'SUCCEEDED');
  return page(`Connected @${TARGET} successfully. Let Zakai know so we can run the read-only account check before any publishing test.`, { cookie: cookie('', 0) });
}

/** @param {Request} request @param {Cloudflare.Env} env @param {typeof fetch} fetchImpl @returns {Promise<Response>} */
export async function handle(request, env, fetchImpl = fetch) {
  const operation = crypto.randomUUID();
  const url = new URL(request.url);
  const isCallback = url.pathname === CALLBACK;
  try {
    if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'bettinghub-instagram', configured: configured(env), publishingEnabled: publishingEnabled(env), mode: publishingEnabled(env) ? 'story-publisher' : 'connection-only', workerVersion: env.CF_VERSION_METADATA?.id || null });
    if (url.origin !== origin(env)) return json({ error: 'NOT_FOUND' }, 404);
    const isOperator = url.pathname.startsWith('/operator/');
    if (isOperator && !await operator(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    const known = ['/operator/instagram/invite', '/operator/instagram/status', '/operator/instagram/check', '/operator/instagram/refresh', '/operator/instagram/disconnect', '/operator/instagram/story-status', '/operator/instagram/publish-current-story', '/connect/instagram', '/auth/instagram/start', CALLBACK].includes(url.pathname);
    if (!known) return json({ error: 'NOT_FOUND' }, 404);
    const allowed = ['/operator/instagram/status', '/connect/instagram', CALLBACK].includes(url.pathname) ? 'GET' : 'POST';
    if (request.method !== allowed) return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!configured(env)) return json({ error: 'INSTAGRAM_SETUP_REQUIRED' }, 503);
    await schema(env);
    if (url.pathname === '/operator/instagram/publish-current-story') return json(await deliverCurrentStory(env, fetchImpl));
    if (url.pathname === '/operator/instagram/story-status') {
      const delivery = await env.DB.prepare('SELECT pick_id AS pickId, operating_date AS operatingDate, state, media_id AS mediaId, published_at AS publishedAt, last_error AS lastError FROM instagram_story_deliveries ORDER BY updated_at DESC LIMIT 1').first();
      return json({ delivery: delivery || null, publishingEnabled: publishingEnabled(env) });
    }
    if (url.pathname === '/operator/instagram/invite') {
      const invite = randomToken();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO instagram_connect_invites (digest, expires_at) VALUES (?, ?)').bind(await hash(invite), Date.now() + 24 * 3600000),
        auditStatement(env, operation, 'INVITE_CREATED', 'SUCCEEDED'),
      ]);
      return json({ authorizeUrl: `${origin(env)}/connect/instagram?invite=${invite}`, expiresInSeconds: 86400, target: TARGET, publishingEnabled: false }, 201);
    }
    if (url.pathname === '/connect/instagram') {
      const invite = url.searchParams.get('invite') || '';
      if (!/^[a-f0-9]{64}$/.test(invite)) throw new SafeError('INVALID_OR_EXPIRED_INSTAGRAM_INVITE', 403);
      const row = await env.DB.prepare('SELECT digest FROM instagram_connect_invites WHERE digest = ? AND consumed_at IS NULL AND expires_at > ?').bind(await hash(invite), Date.now()).first();
      if (!row) throw new SafeError('INVALID_OR_EXPIRED_INSTAGRAM_INVITE', 403);
      return page(`Kobe: authorize only your @${TARGET} Business account. Instagram will ask for profile access and content-publishing permission. No password is shared with Zakai, and publishing remains off.`, { invite });
    }
    if (url.pathname === '/auth/instagram/start') {
      if (request.headers.get('origin') !== origin(env)) throw new SafeError('INVALID_INSTAGRAM_START_ORIGIN', 403);
      const input = await readJsonForm(request);
      const invite = input.get('invite') || '';
      if (!/^[a-f0-9]{64}$/.test(invite)) throw new SafeError('INVALID_OR_EXPIRED_INSTAGRAM_INVITE', 403);
      const claimed = await env.DB.prepare('UPDATE instagram_connect_invites SET consumed_at = ? WHERE digest = ? AND consumed_at IS NULL AND expires_at > ? RETURNING digest').bind(Date.now(), await hash(invite), Date.now()).first();
      if (!claimed) throw new SafeError('INVALID_OR_EXPIRED_INSTAGRAM_INVITE', 403);
      const state = randomToken();
      const browser = randomToken();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO instagram_oauth_states (digest, browser_digest, expires_at) VALUES (?, ?, ?)').bind(await hash(state), await hash(browser), Date.now() + 600000),
        auditStatement(env, operation, 'AUTHORIZATION_STARTED', 'SUCCEEDED'),
      ]);
      const auth = new URL('https://www.instagram.com/oauth/authorize');
      for (const [name, value] of Object.entries({ client_id: env.INSTAGRAM_APP_ID, redirect_uri: `${origin(env)}${CALLBACK}`, response_type: 'code', scope: SCOPES.join(','), state, force_reauth: 'true', enable_fb_login: 'false' })) auth.searchParams.set(name, value);
      return response(null, 302, { location: auth.toString(), 'set-cookie': cookie(browser) });
    }
    if (isCallback) return await connect(request, env, operation, fetchImpl);
    const row = await env.DB.prepare('SELECT * FROM instagram_connections WHERE target = ?').bind(TARGET).first();
    if (url.pathname === '/operator/instagram/status') return json({ connected: Boolean(row), target: TARGET, accountId: row?.account_id || null, expiresAt: row ? new Date(row.expires_at).toISOString() : null, tokenExpired: row ? row.expires_at <= Date.now() : null, lastCheckedAt: row ? new Date(row.checked_at).toISOString() : null, publishingEnabled: publishingEnabled(env) });
    if (url.pathname === '/operator/instagram/disconnect') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM instagram_connections WHERE target = ?').bind(TARGET),
        env.DB.prepare('DELETE FROM instagram_connect_invites'),
        env.DB.prepare('DELETE FROM instagram_oauth_states'),
        auditStatement(env, operation, 'ACCOUNT_DISCONNECTED_LOCALLY', 'SUCCEEDED'),
      ]);
      return json({ connected: false, publishingEnabled: false, providerRevocationRequired: true });
    }
    if (!row) throw new SafeError('INSTAGRAM_NOT_CONNECTED', 409);
    if (row.expires_at <= Date.now()) throw new SafeError('INSTAGRAM_TOKEN_EXPIRED_REAUTHORIZE', 409);
    if (url.pathname === '/operator/instagram/refresh' && Date.now() - row.issued_at < 86400000) throw new SafeError('INSTAGRAM_REFRESH_TOO_EARLY', 409);
    const token = await decrypt(row.encrypted_token, env);
    identity(await provider(env, operation, 'profile', { token }, fetchImpl), row.account_id);
    if (url.pathname === '/operator/instagram/check') {
      const verified = await env.DB.prepare('UPDATE instagram_connections SET checked_at = ? WHERE target = ? AND encrypted_token = ? RETURNING target').bind(Date.now(), TARGET, row.encrypted_token).first();
      if (!verified) throw new SafeError('INSTAGRAM_CONNECTION_CHANGED_RECHECK', 409);
      await audit(env, operation, 'READ_ONLY_ACCOUNT_CHECK', 'SUCCEEDED');
      return json({ verified: true, target: TARGET, businessAccount: true, publishingEnabled: false, operationId: operation });
    }
    const refreshed = tokenResult(await provider(env, operation, 'refresh', { token }, fetchImpl));
    const now = Date.now();
    const updated = await env.DB.prepare('UPDATE instagram_connections SET encrypted_token = ?, issued_at = ?, expires_at = ?, checked_at = ? WHERE target = ? AND encrypted_token = ? RETURNING target').bind(await encrypt(refreshed.access_token, env), now, now + refreshed.expires_in * 1000, now, TARGET, row.encrypted_token).first();
    if (!updated) throw new SafeError('INSTAGRAM_CONNECTION_CHANGED_RECHECK', 409);
    await audit(env, operation, 'TOKEN_REFRESHED', 'SUCCEEDED');
    return json({ refreshed: true, publishingEnabled: false, expiresAt: new Date(now + refreshed.expires_in * 1000).toISOString() });
  } catch (error) {
    const code = error instanceof SafeError ? error.message : 'INSTAGRAM_CONNECTION_FAILED';
    const status = error instanceof SafeError ? error.status : 500;
    // Never log request URLs, invite/state values, OAuth codes, raw provider errors or tokens.
    console.error(JSON.stringify({ service: 'instagram-connection', operationId: operation, error: code }));
    if (configured(env)) {
      try { await audit(env, operation, 'OPERATION_FAILED', code); } catch { /* response still fails closed */ }
    }
    return isCallback ? page(`Connection was not completed. Ask Zakai for a new authorization link and ensure you select @${TARGET}.`, { status, cookie: cookie('', 0) }) : json({ error: code, operationId: operation }, status);
  }
}
async function readJsonForm(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/x-www-form-urlencoded')) throw new SafeError('INVALID_INSTAGRAM_START_FORM');
  // Bound even chunked request bodies; Content-Length is not trusted.
  if (!request.body) throw new SafeError('INVALID_INSTAGRAM_START_FORM');
  const reader = request.body.getReader();
  let result = '';
  const decoder = new TextDecoder();
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1024) throw new SafeError('INSTAGRAM_FORM_TOO_LARGE', 413);
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return new URLSearchParams(result);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

/** @type {ExportedHandler<Cloudflare.Env>} */
const worker = {
  fetch: (request, env) => handle(request, env),
  scheduled: (_controller, env, ctx) => ctx.waitUntil(deliverCurrentStory(env).catch(error => console.error(JSON.stringify({ service: 'instagram-story', error: error instanceof SafeError ? error.message : 'STORY_DELIVERY_FAILED' })))),
};
export default worker;
export const __test = { configured, encrypt, decrypt, identity, hash, readJson, phoenixDate, publishingEnabled, publicationDateAllowed, deliverCurrentStory, SCOPES };
