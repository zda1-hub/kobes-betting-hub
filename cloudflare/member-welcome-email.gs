// Transactional membership onboarding, separate from Kobe's owner-only recap queue.
const MEMBER_WELCOME_WORKER = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';
const MEMBER_WELCOME_SECRET_PROPERTY = 'MEMBER_WELCOME_QUEUE_SECRET';

function memberWelcomeRequest_(path, secret, payload) {
  const options = { method: payload ? 'post' : 'get',
    headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  return UrlFetchApp.fetch(MEMBER_WELCOME_WORKER + '/ops/member-welcomes' + path, options);
}

function testMemberWelcomeConnection() {
  const secret = PropertiesService.getScriptProperties().getProperty(MEMBER_WELCOME_SECRET_PROPERTY);
  if (!secret) throw new Error('Configure the member welcome queue credential first.');
  if (memberWelcomeRequest_('', secret).getResponseCode() !== 200) throw new Error('Member welcome queue connection failed.');
  return 'Member welcome queue is connected. No customer email sent.';
}

function installMemberWelcomeEmails() {
  testMemberWelcomeConnection();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'deliverMemberWelcomeEmails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('deliverMemberWelcomeEmails').timeBased().everyMinutes(5).create();
  return 'Cloud welcome email checks installed every five minutes.';
}

function deliverMemberWelcomeEmails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 'Another welcome sender is running.';
  try {
    const secret = PropertiesService.getScriptProperties().getProperty(MEMBER_WELCOME_SECRET_PROPERTY);
    if (!secret) throw new Error('Member welcome queue credential is missing.');
    const quota = Math.min(10, MailApp.getRemainingDailyQuota());
    if (quota < 1) return 'Daily sender quota exhausted; queued emails retained.';
    const response = memberWelcomeRequest_('', secret);
    if (response.getResponseCode() !== 200) throw new Error('Member welcome queue is unavailable.');
    const notifications = JSON.parse(response.getContentText()).notifications || [];
    let sent = 0;
    notifications.slice(0, quota).forEach(function(item) {
      const claim = memberWelcomeRequest_('/claim', secret, { id: item.id });
      if (claim.getResponseCode() === 409) return;
      if (claim.getResponseCode() !== 200) throw new Error('Member welcome claim failed.');
      const message = JSON.parse(claim.getContentText());
      try {
        MailApp.sendEmail({ to: message.recipient, subject: message.subject, body: message.body,
          name: 'Kobe’s Betting Hub', replyTo: 'zakai@kaimaz.com' });
      } catch (error) {
        // MailApp has no idempotency key. Unknown sends are held, never replayed.
        memberWelcomeRequest_('/hold', secret, { id: message.id, claimToken: message.claimToken });
        throw new Error('Member welcome send needs review; automatic resend disabled.');
      }
      const receipt = memberWelcomeRequest_('/deliver', secret, { id: message.id, claimToken: message.claimToken });
      if (receipt.getResponseCode() !== 200) throw new Error('Welcome sent but receipt needs review; automatic resend disabled.');
      sent += 1;
    });
    return sent + ' member welcome email(s) accepted by the sender.';
  } finally { lock.releaseLock(); }
}
