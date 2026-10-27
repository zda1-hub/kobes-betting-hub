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

const { arbitrageApprovalUserIds, ARBITRAGE_REVIEWER_ID } = require('./approval-access');
test('bbbelt1600 can approve arbitrage without gaining general pick approval', () => {
  assert.ok(arbitrageApprovalUserIds('').has('832944927884312606'));
  assert.equal(ARBITRAGE_REVIEWER_ID, '832944927884312606');
  assert.ok(arbitrageApprovalUserIds('').has(KOBE_APPROVER_ID));
  assert.equal(approvalUserIds('').has(ARBITRAGE_REVIEWER_ID), false);
  assert.equal(arbitrageApprovalUserIds('').has('stranger'), false);
  assert.ok(arbitrageApprovalUserIds('existing-reviewer').has('existing-reviewer'));
});
