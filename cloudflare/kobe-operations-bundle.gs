// GENERATED FILE — edit the version-controlled source files, then rebuild.

// Paste this complete bundle into the installed Apps Script Code.gs file.

// Version-controlled source for the installed Google Apps Script project:
// "Kobe's Betting Hub — Daily Picks Email".
// Secrets and spreadsheet IDs live only in Apps Script Properties.
// Reconcile the installed project against this file before future trigger changes.

const RECIPIENTS = ['themartinventures@gmail.com', 'kobedirwin@gmail.com'];
const TIME_ZONE = 'America/Phoenix';
const PICK_SHEET_KEY = 'PICK_QUEUE_SHEET_ID';
const X_QUEUE_SECRET_KEY = 'X_PUBLISHER_QUEUE_SECRET';
const RECAP_QUEUE_SECRET_KEY = 'RECAP_NOTIFICATION_QUEUE_SECRET';
const RECAP_NOTIFICATION_START_KEY = 'RECAP_NOTIFICATION_START_AT';
const DAILY_EMAIL_HOUR = 14;
const PUBLISHER_URL = 'https://bettinghub-publisher.kobedirwin.workers.dev';

const HEADERS = [
  'Publish Date', 'Sport', 'Event', 'Market', 'Selection', 'Line / Odds',
  'Units', 'Reason', 'CTA', 'Approved', 'Email Sent At'
];

function createPickQueue() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(PICK_SHEET_KEY);
  if (existingId) return SpreadsheetApp.openById(existingId).getUrl();

  const spreadsheet = SpreadsheetApp.create("Kobe's Betting Hub — Daily Pick Queue");
  const sheet = spreadsheet.getSheets()[0];
  sheet.setName('Daily Picks');
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('K:K').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.autoResizeColumns(1, HEADERS.length);
  properties.setProperty(PICK_SHEET_KEY, spreadsheet.getId());
  return spreadsheet.getUrl();
}

function sendDailyApprovedPicks() {
  const sheet = getPickSheet_();
  const values = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  const picks = values.slice(1).map(function(row, index) {
    return { rowNumber: index + 2, row: row };
  }).filter(function(item) {
    const row = item.row;
    return dateKey_(row[0]) === today &&
      String(row[9] || '').trim().toLowerCase() === 'yes' &&
      !row[10];
  });

  // A zero-pick day must be silent. In particular, do not construct or send the
  // old "No approved picks" message that caused the 2026-09-13 false alert.
  if (!picks.length) return 0;

  const subject = "Kobe's Betting Hub — Daily Picks — " + today;
  const htmlBody = buildEmailHtml_(picks, today);
  MailApp.sendEmail({
    to: RECIPIENTS.join(','),
    subject: subject,
    htmlBody: htmlBody,
    body: stripHtml_(htmlBody)
  });

  const sentAt = new Date();
  picks.forEach(function(item) {
    sheet.getRange(item.rowNumber, 11).setValue(sentAt);
  });
  return picks.length;
}

function sendDailyPackage() {
  const emailed = sendDailyApprovedPicks();
  const queued = queueDailyXTeaser();
  return { emailed: emailed, queued: queued };
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === 'sendDailyApprovedPicks' || handler === 'sendDailyPackage') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('sendDailyPackage')
    .timeBased()
    .atHour(DAILY_EMAIL_HOUR)
    .everyDays(1)
    .inTimezone(TIME_ZONE)
    .create();
  return 'Daily email + X teaser schedule created.';
}

function queueDailyXTeaser() {
  if (!hasApprovedPicksForToday_()) return 'No approved picks today; no X post queued.';

  const secret = PropertiesService.getScriptProperties().getProperty(X_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + X_QUEUE_SECRET_KEY + ' in Project Settings before queuing X posts.');

  const today = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/x', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify({
      id: 'daily-teaser-' + today,
      body: 'Today’s card is live in the Hub. Come fuck with the Hub.',
      scheduledAt: new Date().toISOString()
    }),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status !== 201 && status !== 409) {
    throw new Error('X queue request failed (' + status + '): ' + response.getContentText());
  }
  return status === 409 ? 'X teaser was already queued for today.' : 'X teaser queued.';
}

function testXQueueConnection() {
  const secret = PropertiesService.getScriptProperties().getProperty(X_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + X_QUEUE_SECRET_KEY + ' in Project Settings first.');
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/x', {
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('X connection test failed (' + response.getResponseCode() + '): ' + response.getContentText());
  }
  return 'X queue connection is ready. No post was created.';
}

function hasApprovedPicksForToday_() {
  const sheet = getPickSheet_();
  const values = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  return values.slice(1).some(function(row) {
    return dateKey_(row[0]) === today && String(row[9] || '').trim().toLowerCase() === 'yes';
  });
}

function previewToday() {
  const sheet = getPickSheet_();
  const values = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  const picks = values.slice(1).filter(function(row) {
    return dateKey_(row[0]) === today &&
      String(row[9] || '').trim().toLowerCase() === 'yes' &&
      !row[10];
  }).map(function(row) { return { row: row }; });
  Logger.log(buildEmailHtml_(picks, today));
}

function getPickSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PICK_SHEET_KEY);
  if (!id) throw new Error('Run createPickQueue once before sending the daily email.');
  return SpreadsheetApp.openById(id).getSheetByName('Daily Picks');
}

function dateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, TIME_ZONE, 'yyyy-MM-dd');
  }
  return String(value || '').trim().slice(0, 10);
}

function buildEmailHtml_(picks, today) {
  const heading = '<h2>Kobe’s Betting Hub — Daily Picks</h2><p>' + today + '</p>';
  if (!picks.length) return heading + '<p>No approved picks are queued for today.</p>';
  const rows = picks.map(function(item) {
    const row = item.row;
    return '<tr>' +
      '<td>' + escapeHtml_(row[1]) + '</td>' +
      '<td>' + escapeHtml_(row[2]) + '</td>' +
      '<td>' + escapeHtml_(row[3]) + '</td>' +
      '<td><strong>' + escapeHtml_(row[4]) + '</strong><br>' + escapeHtml_(row[5]) + '</td>' +
      '<td>' + escapeHtml_(row[6]) + '</td>' +
      '<td>' + escapeHtml_(row[7]) + '</td>' +
      '<td>' + escapeHtml_(row[8]) + '</td>' +
    '</tr>';
  }).join('');
  return heading + '<table border="1" cellpadding="8" cellspacing="0">' +
    '<tr><th>Sport</th><th>Event</th><th>Market</th><th>Pick</th><th>Units</th><th>Reason</th><th>CTA</th></tr>' +
    rows + '</table><p>For internal review. Publish only approved, current information.</p>';
}

function escapeHtml_(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripHtml_(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function installKobeRecapNotifications() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'deliverKobeRecapNotifications') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('deliverKobeRecapNotifications').timeBased().everyMinutes(5).create();
  return 'Kobe recap and social-package notifications will be delivered every five minutes from the configured activation timestamp.';
}

function testRecapQueueConnection() {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty(RECAP_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + RECAP_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/recap-notifications?after=' + encodeURIComponent(new Date().toISOString()), {
    method: 'get', headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Recap queue connection failed (' + response.getResponseCode() + ').');
  return 'Recap queue connection is ready. No email was sent.';
}

function deliverKobeRecapNotifications() {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty(RECAP_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + RECAP_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const startAt = properties.getProperty(RECAP_NOTIFICATION_START_KEY);
  if (!startAt || isNaN(Date.parse(startAt))) {
    throw new Error('Set ' + RECAP_NOTIFICATION_START_KEY + ' to the activation ISO timestamp before installing this trigger.');
  }
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/recap-notifications?after=' + encodeURIComponent(new Date(startAt).toISOString()), {
    method: 'get',
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Recap notification fetch failed (' + response.getResponseCode() + '): ' + response.getContentText());
  }
  const notifications = JSON.parse(response.getContentText()).notifications || [];
  notifications.forEach(function(item) {
    MailApp.sendEmail(item.recipient, item.subject, item.body);
    const acknowledgement = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/recap-notifications/deliver', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ id: item.id }),
      muteHttpExceptions: true
    });
    if (acknowledgement.getResponseCode() !== 200) {
      throw new Error('Recap notification acknowledgement failed (' + acknowledgement.getResponseCode() + '): ' + acknowledgement.getContentText());
    }
  });
  return notifications.length + ' recap notification(s) delivered.';
}


// Add this file to the SAME Google Apps Script project that already sends
// Kobe's daily email. It adds only inbound Trends handling; it does not alter
// the daily-picks email or automatically publish anything.
const TRENDS_LABEL = 'Kobe Trends';
const TRENDS_QUEUED_LABEL = 'Kobe Trends/Queued';
const TRENDS_QUEUE_SECRET_KEY = 'TRENDS_QUEUE_SECRET';
const TRENDS_EMAIL_START_KEY = 'TRENDS_EMAIL_START_AT';
const TRENDS_SENDER = 'kobedirwin@gmail.com';

function installKobeTrendsInbox() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'queueKobeTrendEmails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('queueKobeTrendEmails').timeBased().everyMinutes(5).create();
  return 'Kobe Trends inbox checks every five minutes. Create the Gmail label “Kobe Trends” and add TRENDS_QUEUE_SECRET in Script Properties.';
}

function queueKobeTrendEmails() {
  const sourceLabel = GmailApp.getUserLabelByName(TRENDS_LABEL);
  if (!sourceLabel) throw new Error('Create the Gmail label “' + TRENDS_LABEL + '” first.');
  const queuedLabel = GmailApp.getUserLabelByName(TRENDS_QUEUED_LABEL) || GmailApp.createLabel(TRENDS_QUEUED_LABEL);
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty(TRENDS_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + TRENDS_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const startAt = properties.getProperty(TRENDS_EMAIL_START_KEY);
  if (!startAt || isNaN(Date.parse(startAt))) throw new Error('Set ' + TRENDS_EMAIL_START_KEY + ' to the activation ISO timestamp first.');
  const startMs = Date.parse(startAt);
  const threads = GmailApp.search('label:"' + TRENDS_LABEL + '" -label:"' + TRENDS_QUEUED_LABEL + '"', 0, 50);
  let queued = 0;
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      if (message.getDate().getTime() < startMs) return;
      const sender = emailAddress_(message.getFrom()).toLowerCase();
      if (sender !== TRENDS_SENDER) return;
      const league = trendLeague_(message.getSubject());
      if (!league) return;
      const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/trends', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify({
          id: 'gmail-' + message.getId(), sender: sender, league: league,
          subject: message.getSubject(), body: message.getPlainBody(), receivedAt: message.getDate().toISOString()
        }),
        muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      if (status !== 201 && status !== 409) throw new Error('Trends queue request failed (' + status + '): ' + response.getContentText());
      queued += status === 201 ? 1 : 0;
    });
    thread.addLabel(queuedLabel);
  });
  return queued + ' Kobe Trends email(s) queued for private Discord approval.';
}

function testTrendsQueueConnection() {
  const secret = PropertiesService.getScriptProperties().getProperty(TRENDS_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + TRENDS_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/trends?limit=1', {
    method: 'get', headers: { Authorization: 'Bearer ' + secret }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Trends queue connection failed (' + response.getResponseCode() + ').');
  return 'Trends queue connection is ready. No email or Discord post was created.';
}

function trendLeague_(subject) {
  const value = String(subject || '').toLowerCase();
  if (/\b(nfl|football)\b/.test(value)) return 'nfl';
  if (/\b(mlb|baseball)\b/.test(value)) return 'mlb';
  return '';
}

function emailAddress_(from) {
  const match = String(from || '').match(/<([^>]+)>/) || String(from || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? String(match[1] || match[0]).trim() : '';
}


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
          name: 'Kobe’s Betting Hub', replyTo: 'support@kobesbettinghub.com' });
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
