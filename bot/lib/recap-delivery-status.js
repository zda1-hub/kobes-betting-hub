function recapDeliveryIssues(recap, date) {
  const issues = [];
  if (recap.morning_review_status !== 'QUEUED') {
    issues.push(`Kobe's private recap review for ${date} has not been queued (${recap.morning_review_status || 'no receipt'}).`);
  }
  if (recap.status === 'PENDING_RESULTS') {
    issues.push(`Final recap for ${date} is waiting for verified results; pending picks remain ungraded.`);
  } else if (recap.status === 'EMAIL_PENDING' || recap.email_status === 'FAILED') {
    issues.push(`Final recap email for ${date} needs retry (${recap.email_status || recap.status}).`);
  }
  return issues;
}

module.exports = { recapDeliveryIssues };
