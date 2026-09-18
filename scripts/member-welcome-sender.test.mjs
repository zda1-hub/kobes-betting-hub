import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../cloudflare/member-welcome-email.gs', import.meta.url), 'utf8');
function sender({ quota = 10, failSend = false, failReceipt = false } = {}) {
  const calls = [];
  let claimed = false;
  let released = false;
  const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { released = true; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail: message => { calls.push({ type: 'mail', message }); if (failSend) throw new Error('private provider detail'); } },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ type: 'request', url, options });
      if (url.endsWith('/claim')) {
        if (claimed) return response(409, {});
        claimed = true;
        return response(200, { id: 'id-1', claimToken: 'token-1', recipient: 'member@example.com', subject: 'Welcome', body: 'Connect Discord' });
      }
      if (url.endsWith('/deliver')) return response(failReceipt ? 503 : 200, {});
      if (url.endsWith('/hold')) return response(200, {});
      return response(200, { notifications: claimed ? [] : [{ id: 'id-1' }] });
    } },
  });
  vm.runInContext(source, context);
  return { context, calls, released: () => released };
}
test('cloud welcome sender claims before sending and records delivery afterward', () => {
  const { context, calls, released } = sender();
  assert.match(context.deliverMemberWelcomeEmails(), /1 member welcome/);
  const steps = calls.map(c => c.type === 'mail' ? 'mail' : c.url.split('/').at(-1));
  assert.deepEqual(steps, ['member-welcomes', 'claim', 'mail', 'deliver']);
  assert.equal(calls.find(c => c.type === 'mail').message.replyTo, 'zakai@kaimaz.com');
  assert.equal(released(), true);
  context.deliverMemberWelcomeEmails();
  assert.equal(calls.filter(c => c.type === 'mail').length, 1);
});
test('exhausted sender quota leaves customer email unclaimed for the next cloud check', () => {
  const { context, calls, released } = sender({ quota: 0 });
  assert.match(context.deliverMemberWelcomeEmails(), /quota exhausted/);
  assert.equal(calls.length, 0);
  assert.equal(released(), true);
});
test('unknown mail acceptance is held and never automatically replayed', () => {
  const { context, calls } = sender({ failSend: true });
  assert.throws(() => context.deliverMemberWelcomeEmails(), /needs review/);
  assert.equal(calls.at(-1).url.endsWith('/hold'), true);
  context.deliverMemberWelcomeEmails();
  assert.equal(calls.filter(c => c.type === 'mail').length, 1);
});
test('a missing delivery receipt cannot cause a repeated customer email', () => {
  const { context, calls } = sender({ failReceipt: true });
  assert.throws(() => context.deliverMemberWelcomeEmails(), /receipt needs review/);
  context.deliverMemberWelcomeEmails();
  assert.equal(calls.filter(c => c.type === 'mail').length, 1);
});
