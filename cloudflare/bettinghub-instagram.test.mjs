import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { DatabaseSync } = await import('node:sqlite').catch(() => ({ DatabaseSync: null }));
const test = (name, fn) => nodeTest(name, { skip: !DatabaseSync && 'Use Node 24 for the SQLite-backed connection suite' }, fn);

const source = await fs.readFile(new URL('./bettinghub-instagram.js', import.meta.url), 'utf8');
const { handle, __test } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const ORIGIN = 'https://instagram.test';
const secret = 'operator-fixture-key-not-real-1234567890';
const longToken = 'long-token-fixture-never-real';

// Real SQLite statements exercise atomic UPDATE/INSERT RETURNING and audit
// triggers, rather than mocking authorization decisions or SQL outcomes.
function database() {
  const sql = new DatabaseSync(':memory:');
  return {
    sql,
    prepare(query) {
      const args = [];
      const statement = {
        bind(...values) { args.push(...values); return statement; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async run() { return { meta: { changes: sql.prepare(query).run(...args).changes } }; },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
}
function environment() {
  return {
    DB: database(), INSTAGRAM_PUBLIC_ORIGIN: ORIGIN,
    INSTAGRAM_APP_ID: '123456789', INSTAGRAM_APP_SECRET: 'app-secret-fixture-never-real',
    INSTAGRAM_OPERATOR_SECRET: secret,
    INSTAGRAM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64'),
    INSTAGRAM_API_VERSION: 'v25.0', CF_VERSION_METADATA: { id: 'local-fixture-version' },
  };
}
function request(path, { key, method = 'GET', body, cookie, origin } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
}
function operatorRequest(path, method = 'POST') { return request(`/operator/instagram/${path}`, { key: secret, method }); }
function providerMock({ username = 'kobeslocks', type = 'Business', granted = __test.SCOPES.join(','), expires = 5184000, nested = true } = {}) {
  const calls = [];
  return {
    calls,
    async fetch(url, init) {
      const parsed = new URL(url);
      calls.push({ url: parsed, method: init.method || 'GET', body: init.body });
      let result;
      if (parsed.hostname === 'api.instagram.com') result = { access_token: 'short-token-fixture', user_id: '111', permissions: granted };
      else if (parsed.pathname.endsWith('/me')) result = { user_id: '98765432101234567', username, account_type: type };
      else result = { access_token: longToken, expires_in: expires, token_type: 'bearer' };
      if (nested && (parsed.hostname === 'api.instagram.com' || parsed.pathname.endsWith('/me'))) result = { data: [result] };
      return Response.json(result, { headers: { 'x-fb-trace-id': 'fixture-trace' } });
    },
  };
}
async function authorization(env) {
  const inviteResponse = await handle(operatorRequest('invite'), env);
  assert.equal(inviteResponse.status, 201);
  const invite = new URL((await inviteResponse.json()).authorizeUrl).searchParams.get('invite');
  const start = await handle(request('/auth/instagram/start', { method: 'POST', body: { invite }, origin: ORIGIN }), env);
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  return { invite, start, state, cookie };
}
async function connected(env, mock = providerMock()) {
  const auth = await authorization(env);
  const result = await handle(request(`/auth/instagram/callback?code=code-fixture&state=${auth.state}`, { cookie: auth.cookie }), env, mock.fetch);
  return { ...auth, result, mock };
}

test('unconfigured service fails closed and never touches a provider', async () => {
  const env = environment(); delete env.INSTAGRAM_APP_SECRET;
  const never = () => { throw new Error('unexpected external call'); };
  assert.deepEqual(await (await handle(request('/health'), env, never)).json(), { service: 'bettinghub-instagram', configured: false, publishingEnabled: false, mode: 'connection-only', workerVersion: 'local-fixture-version' });
  assert.equal((await handle(operatorRequest('invite'), env, never)).status, 503);
  assert.equal(env.DB.sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'instagram_%'").get().n, 0);
});

test('all operator routes reject anonymous, queue and wrong keys before DB access', async () => {
  const env = environment(); env.DB = { prepare() { throw new Error('unauthorized storage'); }, batch() { throw new Error('unauthorized storage'); } };
  for (const key of [undefined, 'website-secret', 'x-delivery-secret', 'wrong']) {
    for (const [path, method] of [['invite', 'POST'], ['status', 'GET'], ['check', 'POST'], ['refresh', 'POST'], ['disconnect', 'POST']]) {
      assert.equal((await handle(request(`/operator/instagram/${path}`, { key, method }), env)).status, 401);
    }
  }
});

test('invitation GET is preview-safe; POST starts consent with only two scopes and browser-bound state', async () => {
  const env = environment();
  const inviteResponse = await handle(operatorRequest('invite'), env);
  const payload = await inviteResponse.json();
  const url = new URL(payload.authorizeUrl);
  for (let repeat = 0; repeat < 2; repeat++) assert.equal((await handle(request(url.pathname + url.search), env)).status, 200);
  const invite = url.searchParams.get('invite');
  assert.equal((await handle(request('/auth/instagram/start', { method: 'POST', body: { invite }, origin: 'https://attacker.test' }), env)).status, 403);
  const start = await handle(request('/auth/instagram/start', { method: 'POST', body: { invite }, origin: ORIGIN }), env);
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get('location'));
  assert.equal(auth.origin + auth.pathname, 'https://www.instagram.com/oauth/authorize');
  assert.equal(auth.searchParams.get('scope'), __test.SCOPES.join(','));
  assert.equal(auth.searchParams.get('redirect_uri'), `${ORIGIN}/auth/instagram/callback`);
  assert.equal(auth.searchParams.get('force_reauth'), 'true');
  assert.match(start.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(start.headers.get('location'), /app-secret|operator-fixture/);
  assert.equal((await handle(request('/auth/instagram/start', { method: 'POST', body: { invite }, origin: ORIGIN }), env)).status, 403);
  const saved = env.DB.sql.prepare('SELECT * FROM instagram_oauth_states').get();
  assert.notEqual(saved.digest, auth.searchParams.get('state'));
});

test('correct Business account stores only encrypted token and redacted append-only audit', async () => {
  const env = environment(); const { result, mock } = await connected(env);
  assert.equal(result.status, 200);
  assert.match(await result.text(), /Connected @kobeslocks successfully/);
  assert.equal(mock.calls.length, 3);
  assert.equal(mock.calls[0].body.get('grant_type'), 'authorization_code');
  assert.equal(mock.calls[0].body.get('redirect_uri'), `${ORIGIN}/auth/instagram/callback`);
  const row = env.DB.sql.prepare('SELECT * FROM instagram_connections').get();
  assert.equal(row.account_id, '98765432101234567');
  assert.equal(await __test.decrypt(row.encrypted_token, env), longToken);
  assert.doesNotMatch(row.encrypted_token, /long-token/);
  const audit = JSON.stringify(env.DB.sql.prepare('SELECT * FROM instagram_connection_audit').all());
  for (const sensitive of [secret, 'short-token-fixture', longToken, 'code-fixture', 'app-secret-fixture-never-real']) assert.equal(audit.includes(sensitive), false);
  assert.match(audit, /ACCOUNT_CONNECTED/);
  assert.match(audit, /fixture-trace/);
  assert.throws(() => env.DB.sql.exec("DELETE FROM instagram_connection_audit"), /append-only/);
  assert.throws(() => env.DB.sql.exec("UPDATE instagram_connection_audit SET outcome = 'changed'"), /append-only/);
  const status = await (await handle(operatorRequest('status', 'GET'), env)).json();
  assert.equal(status.connected, true); assert.equal(status.publishingEnabled, false);
  assert.equal(JSON.stringify(status).includes(longToken), false);
});

test('root-shaped provider responses also connect without assuming data arrays', async () => {
  assert.equal((await connected(environment(), providerMock({ nested: false }))).result.status, 200);
});

test('owner account switch pins invites, consent, stored credentials and status to kobeslocks', async () => {
  const env = environment();
  const invite = await (await handle(operatorRequest('invite'), env)).json();
  assert.equal(invite.target, 'kobeslocks');
  const url = new URL(invite.authorizeUrl);
  const consent = await (await handle(request(url.pathname + url.search), env)).text();
  assert.match(consent, /Authorize @kobeslocks/);
  assert.doesNotMatch(consent, /Authorize @bettinhub|or connect Kobe's Locks/);
  assert.equal((await connected(env, providerMock({ username: 'KobesLocks' }))).result.status, 200);
  assert.equal(env.DB.sql.prepare('SELECT target FROM instagram_connections').get().target, 'kobeslocks');
  assert.equal((await (await handle(operatorRequest('status', 'GET'), env)).json()).target, 'kobeslocks');
  assert.throws(() => __test.identity({ username: 'bettinhub', account_type: 'Business', user_id: '111' }), /USE_KOBESLOCKS/);
  assert.throws(() => env.DB.sql.exec("UPDATE instagram_connections SET target='bettinhub'"), /CHECK constraint/);
});

test('wrong username, Creator account, missing grant and invalid expiration cannot install credentials', async () => {
  for (const options of [{ username: 'bettinhub' }, { type: 'Media_Creator' }, { granted: 'instagram_business_basic' }, { expires: undefined }, { expires: 0 }]) {
    const env = environment(); const mock = providerMock(options);
    // Undefined intentionally exercises a truly missing expiration field.
    if (Object.hasOwn(options, 'expires') && options.expires === undefined) {
      const original = mock.fetch; mock.fetch = async (...args) => { const res = await original(...args); const data = await res.json(); delete data.expires_in; return Response.json(data); };
    }
    const result = (await connected(env, mock)).result;
    assert.ok([403, 502].includes(result.status));
    assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM instagram_connections').get().n, 0);
    assert.equal(env.DB.sql.prepare("SELECT count(*) AS n FROM instagram_connection_audit WHERE event='ACCOUNT_CONNECTED'").get().n, 0);
  }
});

test('callback rejects expired, missing-cookie, mismatched and replayed states before provider calls', async () => {
  for (const variant of ['expired', 'missing-cookie', 'wrong-cookie', 'wrong-state']) {
    const env = environment(); const auth = await authorization(env);
    if (variant === 'expired') env.DB.sql.exec('UPDATE instagram_oauth_states SET expires_at = 0');
    const state = variant === 'wrong-state' ? 'f'.repeat(64) : auth.state;
    const cookie = variant === 'missing-cookie' ? undefined : variant === 'wrong-cookie' ? `__Host-kbh-ig-state=${'f'.repeat(64)}` : auth.cookie;
    assert.equal((await handle(request(`/auth/instagram/callback?code=fixture&state=${state}`, { cookie }), env, () => { throw new Error('should not call provider'); })).status, 403);
  }
  const env = environment(); const auth = await connected(env);
  const before = auth.mock.calls.length;
  assert.equal((await handle(request(`/auth/instagram/callback?code=fixture&state=${auth.state}`, { cookie: auth.cookie }), env, auth.mock.fetch)).status, 403);
  assert.equal(auth.mock.calls.length, before);
});

test('denied authorization is consumed and never exchanges a code', async () => {
  const env = environment(); const auth = await authorization(env); const mock = providerMock();
  assert.equal((await handle(request(`/auth/instagram/callback?error=access_denied&state=${auth.state}`, { cookie: auth.cookie }), env, mock.fetch)).status, 403);
  assert.equal(mock.calls.length, 0);
  assert.notEqual(env.DB.sql.prepare('SELECT consumed_at FROM instagram_oauth_states').get().consumed_at, null);
});

test('failed reauthorization preserves the existing verified account and token', async () => {
  const env = environment(); await connected(env);
  const before = env.DB.sql.prepare('SELECT encrypted_token FROM instagram_connections').get().encrypted_token;
  assert.equal((await connected(env, providerMock({ username: 'bettinhub' }))).result.status, 403);
  assert.equal(env.DB.sql.prepare('SELECT encrypted_token FROM instagram_connections').get().encrypted_token, before);
});

test('disconnect during callback prevents in-flight credential reinstallation', async () => {
  const env = environment(); const mock = providerMock(); const original = mock.fetch;
  mock.fetch = async (...args) => {
    const result = await original(...args);
    if (new URL(args[0]).pathname.endsWith('/me')) assert.equal((await handle(operatorRequest('disconnect'), env)).status, 200);
    return result;
  };
  assert.equal((await connected(env, mock)).result.status, 409);
  assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM instagram_connections').get().n, 0);
});

test('read-only account check makes only a profile GET, never publishes or refreshes', async () => {
  const env = environment(); const { mock } = await connected(env); const before = mock.calls.length;
  const checked = await handle(operatorRequest('check'), env, mock.fetch);
  assert.equal(checked.status, 200); assert.equal((await checked.json()).verified, true);
  assert.equal(mock.calls.length, before + 1); assert.equal(mock.calls.at(-1).method, 'GET');
  assert.match(mock.calls.at(-1).url.pathname, /\/me$/);
  assert.equal((await handle(request('/api/instagram/publish', { method: 'POST' }), env, mock.fetch)).status, 404);
  assert.equal((await handle(request('/operator/instagram/publish', { method: 'POST', key: secret }), env, mock.fetch)).status, 404);
});

test('account check cannot report a disconnected credential as verified', async () => {
  const env = environment(); await connected(env); const mock = providerMock(); const original = mock.fetch;
  mock.fetch = async (...args) => { const result = await original(...args); await handle(operatorRequest('disconnect'), env); return result; };
  assert.equal((await handle(operatorRequest('check'), env, mock.fetch)).status, 409);
  assert.equal(env.DB.sql.prepare("SELECT count(*) AS n FROM instagram_connection_audit WHERE event='READ_ONLY_ACCOUNT_CHECK'").get().n, 0);
});

test('refresh refuses young/expired tokens; eligible refresh persists a new expiry', async () => {
  const env = environment(); const { mock } = await connected(env);
  const youngBefore = mock.calls.length;
  assert.equal((await handle(operatorRequest('refresh'), env, mock.fetch)).status, 409);
  assert.equal(mock.calls.length, youngBefore);
  env.DB.sql.prepare('UPDATE instagram_connections SET issued_at = ?').run(Date.now() - 2 * 86400000);
  assert.equal((await handle(operatorRequest('refresh'), env, mock.fetch)).status, 200);
  assert.equal(mock.calls.at(-1).url.searchParams.get('grant_type'), 'ig_refresh_token');
  env.DB.sql.exec('UPDATE instagram_connections SET expires_at = 0');
  const before = mock.calls.length;
  assert.equal((await handle(operatorRequest('refresh'), env, mock.fetch)).status, 409);
  assert.equal(mock.calls.length, before);
});

test('provider errors, malformed or oversized replies are redacted and fail closed', async () => {
  for (const fetchImpl of [
    async () => Response.json({ error: { message: `sensitive-${longToken}` } }, { status: 400 }),
    async () => new Response('not-json-secret'),
    async () => new Response('x'.repeat(65537)),
    async () => { throw new Error(`network-secret-${longToken}`); },
  ]) {
    const env = environment(); const auth = await authorization(env);
    const result = await handle(request(`/auth/instagram/callback?code=fixture&state=${auth.state}`, { cookie: auth.cookie }), env, fetchImpl);
    assert.equal(result.status, 502); assert.equal((await result.text()).includes(longToken), false);
    assert.equal(env.DB.sql.prepare('SELECT count(*) AS n FROM instagram_connections').get().n, 0);
    assert.equal(JSON.stringify(env.DB.sql.prepare('SELECT * FROM instagram_connection_audit').all()).includes(longToken), false);
  }
});

test('audit failure prevents an external provider call', async () => {
  const env = environment(); const auth = await authorization(env);
  env.DB.sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON instagram_connection_audit WHEN NEW.event='PROVIDER_CALL' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  let calls = 0;
  const result = await handle(request(`/auth/instagram/callback?code=fixture&state=${auth.state}`, { cookie: auth.cookie }), env, () => { calls++; throw new Error('unexpected'); });
  assert.equal(result.status, 500); assert.equal(calls, 0);
});

test('expired invites, wrong origin, oversized forms and wrong methods fail closed', async () => {
  const env = environment(); const { invite } = await authorization(env);
  env.DB.sql.exec('UPDATE instagram_connect_invites SET expires_at=0, consumed_at=NULL');
  assert.equal((await handle(request(`/connect/instagram?invite=${invite}`), env)).status, 403);
  assert.equal((await handle(new Request(`https://attacker.test/connect/instagram?invite=${invite}`), env)).status, 404);
  assert.equal((await handle(request('/auth/instagram/start', { method: 'POST', origin: ORIGIN, body: { invite: 'a'.repeat(1200) } }), env)).status, 413);
  assert.equal((await handle(operatorRequest('invite', 'GET'), env)).status, 405);
});

test('encrypted credentials are random per write and cannot decrypt under another key', async () => {
  const env = environment(); const first = await __test.encrypt(longToken, env); const second = await __test.encrypt(longToken, env);
  assert.notEqual(first, second);
  await assert.rejects(() => __test.decrypt(first, { ...env, INSTAGRAM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64') }));
});

nodeTest('OAuth config disables URL-bearing logs, isolates staging, and schedules production delivery', async () => {
  const config = JSON.parse(await fs.readFile(new URL('../wrangler.instagram.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.observability.logs.invocation_logs, false);
  assert.equal(config.observability.traces.enabled, false);
  assert.equal(config.compatibility_flags.includes('nodejs_compat'), true);
  assert.deepEqual(config.triggers.crons, ['*/5 * * * *']);
  assert.deepEqual(config.env.staging.triggers.crons, []);
  assert.notEqual(config.d1_databases[0].database_id, config.env.staging.d1_databases[0].database_id);
  assert.equal(config.vars.INSTAGRAM_APP_ID, '1068122172774873');
  for (const secretName of ['INSTAGRAM_APP_SECRET', 'INSTAGRAM_OPERATOR_SECRET', 'INSTAGRAM_TOKEN_ENCRYPTION_KEY']) assert.equal(Object.hasOwn(config.vars, secretName), false);
});

nodeTest('Story delivery is limited to the official current Free Pick and remains feature-gated', () => {
  assert.match(source, /media_publish/);
  assert.match(source, /media_type: 'STORIES'/);
  assert.match(source, /INSTAGRAM_PUBLISHING_ENABLED/);
  assert.doesNotMatch(source, /FREE_PICK_X|FREE_PICK_SITE/);
});

nodeTest('Instagram launch cannot backfill a pick from before September 21', () => {
  const env = { INSTAGRAM_NOT_BEFORE_DATE: '2026-09-21' };
  assert.equal(__test.publicationDateAllowed(env, '2026-09-20'), false);
  assert.equal(__test.publicationDateAllowed(env, '2026-09-21'), true);
  assert.equal(__test.publicationDateAllowed(env, '2026-09-22'), true);
});
