const test = require('node:test');
const assert = require('node:assert/strict');
const { approvalUserIds } = require('./approval-access');
const { KOBE_APPROVER_ID } = require('./record-eligibility');

test('Kobe can review every approval flow without an optional Render allowlist', () => {
  assert.deepEqual([...approvalUserIds('')], [KOBE_APPROVER_ID]);
});

test('configured additional approvers remain authorized without duplicating Kobe', () => {
  const ids = approvalUserIds(`${KOBE_APPROVER_ID}, other-approver`);
  assert.equal(ids.size, 2);
  assert.ok(ids.has(KOBE_APPROVER_ID));
  assert.ok(ids.has('other-approver'));
});
