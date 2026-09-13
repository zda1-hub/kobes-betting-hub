// Version-controlled source for the installed Google Apps Script project:
// "Kobe's Betting Hub — Daily Picks Email".
// Secrets and spreadsheet IDs live only in Apps Script Properties.
// Reconcile the installed project against this file before future trigger changes.

const RECIPIENTS = ['themartinventures@gmail.com', 'kobedirwin@gmail.com'];
const TIME_ZONE = 'America/Phoenix';
const PICK_SHEET_KEY = 'PICK_QUEUE_SHEET_ID';
const X_QUEUE_SECRET_KEY = 'X_PUBLISHER_QUEUE_SECRET';
const RECAP_QUEUE_SECRET_KEY = 'RECAP_NOTIFICATION_QUEUE_SECRET';
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

// This function is intentionally not installed as a trigger while its dedicated
// queue credential is unresolved. Render remains the active recap producer.
function deliverKobeRecapNotifications() {
  const secret = PropertiesService.getScriptProperties().getProperty(RECAP_QUEUE_SECRET_KEY);
  if (!secret) throw new Error('Set ' + RECAP_QUEUE_SECRET_KEY + ' in Apps Script Project Settings first.');
  const response = UrlFetchApp.fetch(PUBLISHER_URL + '/api/queue/recap-notifications', {
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
