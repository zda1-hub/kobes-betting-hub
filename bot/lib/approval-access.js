const { listFromEnv } = require('./pick');
const { KOBE_APPROVER_ID } = require('./record-eligibility');

function approvalUserIds(configuredIds) {
  const ids = listFromEnv(configuredIds);
  ids.add(KOBE_APPROVER_ID);
  return ids;
}

// bbbelt1600: owner-authorized arbitrage reviewer, October 27, 2026.
// Keep this grant out of general pick approval permissions.
const ARBITRAGE_REVIEWER_ID = '832944927884312606';
// The KBH owner authorized this same account to review Free Pick results on November 9.
// This does not grant original-pick or other content approval access.
const FREE_PICK_RESULT_OWNER_ID = '832944927884312606';
function arbitrageApprovalUserIds(configuredIds) {
  const ids = approvalUserIds(configuredIds);
  ids.add(ARBITRAGE_REVIEWER_ID);
  return ids;
}

function freePickResultApprovalUserIds() {
  return new Set([KOBE_APPROVER_ID, FREE_PICK_RESULT_OWNER_ID]);
}

module.exports = { approvalUserIds, arbitrageApprovalUserIds, freePickResultApprovalUserIds,
  ARBITRAGE_REVIEWER_ID, FREE_PICK_RESULT_OWNER_ID };
