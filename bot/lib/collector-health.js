const MARKER = 'KBH collector health';
function collectorHealthPayload(result) {
  const blocked = result.apiBlocked;
  const failed = Number(result.failedSources || 0);
  const state = blocked ? 'BLOCKED' : failed ? 'DEGRADED' : 'RECOVERED';
  const reason = blocked === 'X_SPEND_CAP' ? 'X has reached its billing-cycle spending cap. New X picks and exclusives cannot be collected until the owner raises the cap.'
    : blocked === 'X_CREDITS' ? 'X API credits are depleted. The owner must restore credits before collection resumes.'
    : failed ? `${failed} source scan(s) failed. Successful sources still run; failed sources retain their cursor for retry.`
    : 'X source collection is responding again. Kobe still controls every member-facing publication.';
  return { state, payload: { allowedMentions: { parse: [] }, embeds: [{
    title: state === 'RECOVERED' ? 'Pick collection restored' : 'Pick collection needs attention',
    description: `${reason}\n\nThis pass: ${result.created || 0} approval cards created; ${result.deferred || 0} candidates waiting for the next extraction pass.\nRegular picks and exclusives share this X connection. Telegram intake runs separately.`,
    color: state === 'RECOVERED' ? 0x2e7d32 : 0xd97706,
    footer: { text: `${MARKER} · ${state}` }, timestamp: new Date().toISOString()
  }] } };
}
module.exports = { MARKER, collectorHealthPayload };
