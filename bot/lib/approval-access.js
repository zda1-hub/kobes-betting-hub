const { listFromEnv } = require('./pick');
const { KOBE_APPROVER_ID } = require('./record-eligibility');

function approvalUserIds(configuredIds) {
  const ids = listFromEnv(configuredIds);
  ids.add(KOBE_APPROVER_ID);
  return ids;
}

module.exports = { approvalUserIds };
