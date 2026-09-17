// Only an explicit 429 is known not to have created a message. Never retry
// network errors, audit failures, or ambiguous 5xx responses on a POST.
async function discordRateLimitedFetch(url, init, context, { fetchImpl, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const send = fetchImpl || require('./api-client').auditedFetch;
  for (let attempt = 0; ; attempt += 1) {
    const response = await send(url, init, { ...context, retryCount: attempt });
    if (response.status !== 429 || attempt >= 5) return response;
    let seconds;
    try { seconds = Number((await response.clone().json()).retry_after); } catch { return response; }
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) return response;
    await sleep(Math.ceil(seconds * 1000) + 100);
  }
}
function onlyRateLimitedApprovalAttempts(rows) {
  return rows.length > 0 && rows.every(row => row.response_status === 429 && row.outcome === 'HTTP_ERROR');
}
function recoverySendFailureStatus(error) {
  return error?.responseStatus === 429 ? 'RECOVERY_RESERVED' : 'RECOVERY_SEND_UNCERTAIN';
}
module.exports = { discordRateLimitedFetch, onlyRateLimitedApprovalAttempts, recoverySendFailureStatus };
