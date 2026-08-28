const path = require('node:path');

const DEFAULT_PICK_LOG_PATH = path.join(__dirname, '..', '..', 'trackers', 'pick-log.csv');

function reviewQueuePath() {
  const configured = process.env.X_REVIEW_QUEUE_PATH?.trim();
  if (configured) return configured;

  // On Render, keep approval drafts beside the canonical pick log so a
  // restart or deploy cannot make existing Discord approval buttons stale.
  const pickLogPath = process.env.PICK_LOG_PATH || DEFAULT_PICK_LOG_PATH;
  return path.join(path.dirname(pickLogPath), 'x-review-queue');
}

module.exports = { reviewQueuePath };
