import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Fixed loopback-only target; curl never follows the Instagram redirect.
// Start wrangler locally with the documented fixture overrides, not real keys.
const BASE = 'https://localhost:8796';
const KEY = 'operator-fixture-key-not-real-1234567890';
let assertions = 0;
function call(path, { method = 'GET', key, body, cookie, origin } = {}) {
  const args = ['-ksS', '--max-time', '10', '-D', '-', '-X', method, `${BASE}${path}`];
  if (key) args.push('-H', `Authorization: Bearer ${key}`);
  if (cookie) args.push('-H', `Cookie: ${cookie}`);
  if (origin) args.push('-H', `Origin: ${origin}`);
  if (body) args.push('-H', 'Content-Type: application/x-www-form-urlencoded', '--data', new URLSearchParams(body).toString());
  const result = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 65536 });
  const separator = result.indexOf('\r\n\r\n');
  const lines = result.slice(0, separator).split('\r\n');
  return {
    status: Number(lines[0].split(' ')[1]),
    headers: Object.fromEntries(lines.slice(1).filter(Boolean).map(line => { const split = line.indexOf(':'); return [line.slice(0, split).toLowerCase(), line.slice(split + 1).trim()]; })),
    body: result.slice(separator + 4),
  };
}
function check(actual, expected) { assert.equal(actual, expected); assertions++; }
const health = JSON.parse(call('/health').body);
check(health.configured, true); check(health.publishingEnabled, false);
check(call('/operator/instagram/status').status, 401);
check(call('/operator/instagram/invite', { method: 'POST', key: 'wrong-key' }).status, 401);
check(JSON.parse(call('/operator/instagram/status', { key: KEY }).body).connected, false);
const invitation = call('/operator/instagram/invite', { method: 'POST', key: KEY });
check(invitation.status, 201);
const inviteUrl = new URL(JSON.parse(invitation.body).authorizeUrl);
const invite = inviteUrl.searchParams.get('invite');
check(call(inviteUrl.pathname + inviteUrl.search).status, 200);
check(call(inviteUrl.pathname + inviteUrl.search).status, 200);
const start = call('/auth/instagram/start', { method: 'POST', body: { invite }, origin: BASE });
check(start.status, 302);
const authorize = new URL(start.headers.location);
check(authorize.origin, 'https://www.instagram.com');
check(authorize.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish');
const state = authorize.searchParams.get('state');
const cookie = start.headers['set-cookie'].split(';')[0];
check(call(`/auth/instagram/callback?state=${state}&error=access_denied`, { cookie }).status, 403);
check(call(`/auth/instagram/callback?state=${state}&code=not-a-real-code`, { cookie }).status, 403);
check(call('/operator/instagram/publish', { method: 'POST', key: KEY }).status, 404);
check(call('/operator/instagram/disconnect', { method: 'POST', key: KEY }).status, 200);
check(JSON.parse(call('/operator/instagram/status', { key: KEY }).body).connected, false);
console.log(JSON.stringify({ passed: true, assertions, target: 'loopback only', providerAuthorization: 'declined fixture', publicPosts: 0 }));
