const test = require('node:test');
const assert = require('node:assert/strict');
const { recapDeliveryIssues } = require('./recap-delivery-status');

test('queued private review is not reported missing while final results are pending', () => {
  const issues = recapDeliveryIssues({ morning_review_status: 'QUEUED', status: 'PENDING_RESULTS' }, '2026-10-04');
  assert.equal(issues.some((issue) => issue.includes('private recap review')), false);
  assert.equal(issues.some((issue) => issue.includes('waiting for verified results')), true);
});

test('missing review receipt and failed final email are surfaced', () => {
  const issues = recapDeliveryIssues({ status: 'EMAIL_PENDING', email_status: 'FAILED' }, '2026-10-04');
  assert.equal(issues.length, 2);
  assert.match(issues[0], /has not been queued/);
  assert.match(issues[1], /needs retry/);
});
